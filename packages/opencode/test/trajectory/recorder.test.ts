import { describe, expect, test } from "bun:test"
import path from "path"
import fs from "fs/promises"
import { TrajectoryRecorder } from "../../src/trajectory/recorder"
import type { Trajectory } from "../../src/trajectory/types"
import { tmpdir } from "../fixture/fixture"

/**
 * Core recorder tests - focus on file writing, JSONL format, and buffering.
 * These validate the actual trajectory recording mechanism works.
 */
describe("TrajectoryRecorder", () => {
  test("should write events to JSONL file", async () => {
    await using tmp = await tmpdir()
    const filePath = path.join(tmp.path, "test.jsonl")
    const sessionID = "test-session"

    TrajectoryRecorder.start(sessionID, {
      agent: "general",
      model: { provider: "anthropic", id: "claude-4" },
      filePath,
    })

    await TrajectoryRecorder.record(sessionID, {
      type: "session_start",
      timestamp: Date.now(),
      sessionID,
      agent: "general",
      model: { provider: "anthropic", id: "claude-4" },
      workingDirectory: "/test",
    })

    await TrajectoryRecorder.record(sessionID, {
      type: "agent_step",
      timestamp: Date.now(),
      sessionID,
      step: 1,
      action: "loop_start",
      state: {
        messageCount: 1,
        hasSnapshot: false,
        contextOverflow: false,
      },
    })

    await TrajectoryRecorder.stop(sessionID)

    // Verify file exists and has valid JSONL
    const content = await fs.readFile(filePath, "utf-8")
    const lines = content.trim().split("\n")
    expect(lines.length).toBe(2)

    // Each line should be valid JSON
    const events = lines.map((line) => JSON.parse(line) as Trajectory.Event)
    expect(events[0].type).toBe("session_start")
    expect(events[1].type).toBe("agent_step")
  })

  test("should maintain valid JSONL format with multiple events", async () => {
    await using tmp = await tmpdir()
    const filePath = path.join(tmp.path, "test.jsonl")
    const sessionID = "test-session"

    TrajectoryRecorder.start(sessionID, {
      agent: "general",
      model: { provider: "anthropic", id: "claude-4" },
      filePath,
    })

    // Write 100 events
    for (let i = 0; i < 100; i++) {
      await TrajectoryRecorder.record(sessionID, {
        type: "agent_step",
        timestamp: Date.now(),
        sessionID,
        step: i + 1,
        action: "loop_start",
        state: {
          messageCount: i + 1,
          hasSnapshot: false,
          contextOverflow: false,
        },
      })
    }

    await TrajectoryRecorder.stop(sessionID)

    const content = await fs.readFile(filePath, "utf-8")
    const lines = content.trim().split("\n")
    expect(lines.length).toBe(100)

    // Every line should be valid JSON
    lines.forEach((line, i) => {
      const event = JSON.parse(line)
      expect(event.type).toBe("agent_step")
      expect(event.step).toBe(i + 1)
    })
  })

  test("should flush at end of LLM stream", async () => {
    await using tmp = await tmpdir()
    const filePath = path.join(tmp.path, "test.jsonl")
    const sessionID = "test-session"

    TrajectoryRecorder.start(sessionID, {
      agent: "general",
      model: { provider: "anthropic", id: "claude-4" },
      filePath,
    })

    TrajectoryRecorder.markStreamStart(sessionID)

    // Record stream events
    await TrajectoryRecorder.record(sessionID, {
      type: "stream_event",
      timestamp: Date.now(),
      sessionID,
      messageID: "msg_1",
      step: 1,
      eventType: "response",
      data: { text: "Hello" },
    })

    await TrajectoryRecorder.record(sessionID, {
      type: "stream_event",
      timestamp: Date.now(),
      sessionID,
      messageID: "msg_1",
      step: 1,
      eventType: "response",
      data: { text: " world" },
    })

    // Mark stream end - should flush
    await TrajectoryRecorder.markStreamEnd(sessionID)

    // Verify events were written
    const content = await fs.readFile(filePath, "utf-8")
    const lines = content.trim().split("\n")
    expect(lines.length).toBe(2)

    await TrajectoryRecorder.stop(sessionID)
  })

  test("should record complete event data without truncation", async () => {
    await using tmp = await tmpdir()
    const filePath = path.join(tmp.path, "test.jsonl")
    const sessionID = "test-session"

    TrajectoryRecorder.start(sessionID, {
      agent: "general",
      model: { provider: "anthropic", id: "claude-4" },
      filePath,
    })

    // Large tool output (10KB)
    const largeOutput = "x".repeat(10000)

    await TrajectoryRecorder.record(sessionID, {
      type: "tool_execution",
      timestamp: Date.now(),
      sessionID,
      messageID: "msg_1",
      step: 1,
      tool: "bash",
      callID: "call_1",
      input: { command: "cat largefile.txt" },
      status: "completed",
      startTime: Date.now(),
      endTime: Date.now() + 100,
      duration: 100,
      result: {
        title: "Read file",
        output: largeOutput,
      },
    })

    await TrajectoryRecorder.stop(sessionID)

    const content = await fs.readFile(filePath, "utf-8")
    const event = JSON.parse(content.trim()) as Trajectory.ToolExecutionEvent

    // Verify full output was recorded
    expect(event.result?.output.length).toBe(10000)
    expect(event.result?.output).toBe(largeOutput)
  })

  test("should append to file for multiple sessions", async () => {
    await using tmp = await tmpdir()
    const filePath = path.join(tmp.path, "shared.jsonl")

    // Session 1
    TrajectoryRecorder.start("session-1", {
      agent: "general",
      model: { provider: "anthropic", id: "claude-4" },
      filePath,
    })

    await TrajectoryRecorder.record("session-1", {
      type: "session_start",
      timestamp: Date.now(),
      sessionID: "session-1",
      agent: "general",
      model: { provider: "anthropic", id: "claude-4" },
      workingDirectory: "/test",
    })

    await TrajectoryRecorder.stop("session-1")

    // Session 2 - same file
    TrajectoryRecorder.start("session-2", {
      agent: "general",
      model: { provider: "anthropic", id: "claude-4" },
      filePath,
    })

    await TrajectoryRecorder.record("session-2", {
      type: "session_start",
      timestamp: Date.now(),
      sessionID: "session-2",
      agent: "general",
      model: { provider: "anthropic", id: "claude-4" },
      workingDirectory: "/test",
    })

    await TrajectoryRecorder.stop("session-2")

    // Verify both sessions in file
    const content = await fs.readFile(filePath, "utf-8")
    const lines = content.trim().split("\n")
    expect(lines.length).toBe(2)

    const events = lines.map((line) => JSON.parse(line))
    expect(events[0].sessionID).toBe("session-1")
    expect(events[1].sessionID).toBe("session-2")
  })

  test("should preserve buffer on recording failures for retry", async () => {
    const sessionID = "test-session"
    const invalidPath = "/invalid/nonexistent/path/test.jsonl"

    TrajectoryRecorder.start(sessionID, {
      agent: "general",
      model: { provider: "anthropic", id: "claude-4" },
      filePath: invalidPath,
    })

    // Recording should not throw - errors are caught to preserve buffer for retry
    await TrajectoryRecorder.record(sessionID, {
      type: "session_start",
      timestamp: Date.now(),
      sessionID,
      agent: "general",
      model: { provider: "anthropic", id: "claude-4" },
      workingDirectory: "/test",
    })

    // Session should still be recording (buffer preserved)
    expect(TrajectoryRecorder.isRecording(sessionID)).toBe(true)

    // Clean up
    await TrajectoryRecorder.stop(sessionID)
  })

  test("should silently ignore recording to session that hasn't started", async () => {
    // Should not throw, just silently return
    await TrajectoryRecorder.record("nonexistent-session", {
      type: "session_start",
      timestamp: Date.now(),
      sessionID: "nonexistent-session",
      agent: "general",
      model: { provider: "anthropic", id: "claude-4" },
      workingDirectory: "/test",
    })
    // Session should not exist
    expect(TrajectoryRecorder.isRecording("nonexistent-session")).toBe(false)
  })

  test("should capture LLM interaction with accurate token usage", async () => {
    await using tmp = await tmpdir()
    const filePath = path.join(tmp.path, "test.jsonl")
    const sessionID = "test-session"

    TrajectoryRecorder.start(sessionID, {
      agent: "general",
      model: { provider: "anthropic", id: "claude-4" },
      filePath,
    })

    await TrajectoryRecorder.captureInteraction(sessionID, {
      messageID: "msg_123",
      step: 1,
      input: {
        systemPrompts: ["You are a helpful assistant"],
        messages: [{ role: "user", content: "Hello" }],
        tools: { bash: {}, read: {}, write: {} },
        parameters: { temperature: 0.7, maxOutputTokens: 4096 },
      },
      response: {
        finishReason: "end_turn",
        tokens: {
          input: 150,
          output: 200,
          reasoning: 50,
          cache: { read: 1000, write: 500 },
        },
        parts: [
          { type: "text", text: "Hello! How can I help?" },
          { type: "tool", text: undefined },
        ],
      },
      timing: {
        startTime: 1000,
        endTime: 2500,
      },
    })

    await TrajectoryRecorder.stop(sessionID)

    const content = await fs.readFile(filePath, "utf-8")
    const event = JSON.parse(content.trim()) as Trajectory.LLMInteractionEvent

    // Verify token usage is accurately captured
    expect(event.type).toBe("llm_interaction")
    expect(event.response.usage.inputTokens).toBe(150)
    expect(event.response.usage.outputTokens).toBe(200)
    expect(event.response.usage.reasoningTokens).toBe(50)
    expect(event.response.usage.cacheReadTokens).toBe(1000)
    expect(event.response.usage.cacheWriteTokens).toBe(500)
    expect(event.response.usage.totalInputTokens).toBe(1150) // 150 + 1000
    expect(event.response.usage.totalOutputTokens).toBe(700) // 200 + 500
    expect(event.response.usage.totalCacheTokens).toBe(1500) // 1000 + 500

    // Verify other metadata
    expect(event.input.toolCount).toBe(3)
    expect(event.input.toolNames).toEqual(["bash", "read", "write"])
    expect(event.response.toolCallCount).toBe(1)
    expect(event.response.textLength).toBe(22) // "Hello! How can I help?"
    expect(event.duration).toBe(1500)
  })

  test("should isolate events between concurrent sessions", async () => {
    await using tmp = await tmpdir()
    const fileA = path.join(tmp.path, "session-a.jsonl")
    const fileB = path.join(tmp.path, "session-b.jsonl")

    TrajectoryRecorder.start("session-a", {
      agent: "general",
      model: { provider: "anthropic", id: "claude-4" },
      filePath: fileA,
    })

    TrajectoryRecorder.start("session-b", {
      agent: "general",
      model: { provider: "openai", id: "gpt-4" },
      filePath: fileB,
    })

    // Record to session A
    await TrajectoryRecorder.record("session-a", {
      type: "agent_step",
      timestamp: Date.now(),
      sessionID: "session-a",
      step: 1,
      action: "loop_start",
      state: { messageCount: 1, hasSnapshot: false, contextOverflow: false },
    })

    // Record to session B
    await TrajectoryRecorder.record("session-b", {
      type: "agent_step",
      timestamp: Date.now(),
      sessionID: "session-b",
      step: 1,
      action: "llm_call",
      state: { messageCount: 2, hasSnapshot: true, contextOverflow: false },
    })

    await TrajectoryRecorder.stop("session-a")
    await TrajectoryRecorder.stop("session-b")

    // Verify session A only has its event
    const contentA = await fs.readFile(fileA, "utf-8")
    const eventA = JSON.parse(contentA.trim()) as Trajectory.AgentStepEvent
    expect(eventA.sessionID).toBe("session-a")
    expect(eventA.action).toBe("loop_start")

    // Verify session B only has its event
    const contentB = await fs.readFile(fileB, "utf-8")
    const eventB = JSON.parse(contentB.trim()) as Trajectory.AgentStepEvent
    expect(eventB.sessionID).toBe("session-b")
    expect(eventB.action).toBe("llm_call")
  })

  test("should be idempotent when starting same session twice", async () => {
    await using tmp = await tmpdir()
    const filePath = path.join(tmp.path, "test.jsonl")
    const sessionID = "test-session"

    TrajectoryRecorder.start(sessionID, {
      agent: "general",
      model: { provider: "anthropic", id: "claude-4" },
      filePath,
    })

    // Start again - should be ignored
    TrajectoryRecorder.start(sessionID, {
      agent: "different-agent",
      model: { provider: "openai", id: "gpt-4" },
      filePath: path.join(tmp.path, "different.jsonl"),
    })

    // Should still be recording to original path
    expect(TrajectoryRecorder.isRecording(sessionID)).toBe(true)

    await TrajectoryRecorder.record(sessionID, {
      type: "session_start",
      timestamp: Date.now(),
      sessionID,
      agent: "general",
      model: { provider: "anthropic", id: "claude-4" },
      workingDirectory: "/test",
    })

    await TrajectoryRecorder.stop(sessionID)

    // File should exist at original path
    const content = await fs.readFile(filePath, "utf-8")
    expect(content.trim().length).toBeGreaterThan(0)

    // Different path should not exist
    const differentExists = await fs.access(path.join(tmp.path, "different.jsonl")).then(() => true).catch(() => false)
    expect(differentExists).toBe(false)
  })
})
