# Trajectory Recording Module

Records complete agent execution traces to JSONL files for accurate token usage measurement and session analysis.

## Purpose

The primary use case is **measuring token usage** that the agent consumes. Each LLM interaction is recorded with detailed token breakdowns:

- Input/output tokens
- Reasoning tokens
- Cache read/write tokens
- Computed totals

## Location

```
packages/opencode/src/trajectory/
├── index.ts      # Public exports
├── types.ts      # Event type definitions
├── recorder.ts   # Core recording logic
└── config.ts     # Configuration defaults
```

## Event Types

| Event             | Description                                                 |
| ----------------- | ----------------------------------------------------------- |
| `session_start`   | Agent session initialization with model info                |
| `llm_interaction` | LLM call with full token usage breakdown                    |
| `stream_event`    | Granular streaming events (reasoning, response, tool calls) |
| `tool_execution`  | Tool invocations with timing and results                    |
| `agent_step`      | Agent loop state transitions                                |
| `compaction`      | Context compaction events                                   |

## Token Usage Schema

The `llm_interaction` event captures:

```typescript
usage: {
  inputTokens: number
  outputTokens: number
  reasoningTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  totalInputTokens?: number   // input + cache read
  totalOutputTokens?: number  // output + cache write
  totalCacheTokens?: number   // cache read + write
}
```

## Output

Trajectories are written to `.opencode/trajectories/` as JSONL files:

```
trajectory_{sessionID}_{timestamp}.jsonl
```

Each line is a self-contained JSON event with timestamp and session ID.

## Integration Points

The recorder hooks into:

- **prompt.ts** — Session start/stop, agent steps, tool executions, title generation
- **processor.ts** — Stream events during LLM streaming
- **compaction.ts** — Context compaction events
- **summary.ts** — Summary generation LLM calls

## Usage

```typescript
import { TrajectoryRecorder } from "./trajectory"

// Start recording (typically at session creation)
TrajectoryRecorder.start(sessionID, { agent, model })

// Record events
await TrajectoryRecorder.record(sessionID, event)

// High-level capture for LLM interactions
await TrajectoryRecorder.captureInteraction(sessionID, { ... })

// Stop and flush
await TrajectoryRecorder.stop(sessionID)
```

## Configuration

Static defaults (no runtime configuration):

- **enabled**: `true`
- **outputPath**: `.opencode/trajectories`
- **bufferSize**: `1000` events
- **flushStrategy**: `end_of_stream`
- **captureStreamEvents**: `true`

## Design Decisions

1. **Silent failures** — Recording errors don't interrupt agent execution
2. **Buffered writes** — Events buffered until stream end for efficiency
3. **JSONL format** — Append-friendly, streamable, easy to parse
4. **No data truncation** — Full event data preserved for accurate analysis
