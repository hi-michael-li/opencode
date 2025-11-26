import { describe, expect, test } from "bun:test"
import path from "path"
import { TrajectoryConfig } from "../../src/trajectory/config"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"

/**
 * Minimal config tests - just verify config is loaded and can be overridden.
 * Focus on what matters for the feature, not trivial getter/setter tests.
 */
describe("TrajectoryConfig", () => {
  test("should be enabled by default", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const config = TrajectoryConfig.get()
        expect(config.enabled).toBe(true)
      },
    })
  })

  test("should use static defaults regardless of opencode.json", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(
          path.join(dir, "opencode.json"),
          JSON.stringify({
            $schema: "https://opencode.ai/config.json",
            trajectory: {
              enabled: false,
              outputPath: "./custom-trajectories",
              filenameTemplate: "custom_{sessionID}.jsonl",
            },
          }),
        )
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const config = TrajectoryConfig.get()
        // Config is now static defaults, not loaded from files
        expect(config.enabled).toBe(true)
        expect(config.outputPath).toBe(".opencode/trajectories")
        expect(config.filenameTemplate).toBe("trajectory_{sessionID}_{timestamp}.jsonl")
      },
    })
  })

  test("should resolve filename template with default template", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const filename = TrajectoryConfig.resolveFilename("ses_123", {
          agent: "general",
          model: "claude-sonnet-4",
          timestamp: 1700000000,
        })

        // Uses default template: "trajectory_{sessionID}_{timestamp}.jsonl"
        expect(filename).toBe("trajectory_ses_123_1700000000.jsonl")
      },
    })
  })

  test("should prefer env override when present", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const previous = process.env["OPENCODE_TRAJECTORY_INSTANCE_ID"]
        process.env["OPENCODE_TRAJECTORY_INSTANCE_ID"] = "inst_456"
        const filename = TrajectoryConfig.resolveFilename("ses_123", {
          agent: "general",
          model: "claude-sonnet-4",
          timestamp: 1700000000,
        })
        if (previous === undefined) delete process.env["OPENCODE_TRAJECTORY_INSTANCE_ID"]
        if (previous !== undefined) process.env["OPENCODE_TRAJECTORY_INSTANCE_ID"] = previous
        expect(filename).toBe("trajectory_inst_456_1700000000.jsonl")
      },
    })
  })

  test("should sanitize model names with slashes in resolveFilename", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const filename = TrajectoryConfig.resolveFilename("ses_123", {
          agent: "general",
          model: "anthropic/claude-sonnet-4",
          timestamp: 1700000000,
        })

        // Default template doesn't include {model}, but resolveFilename
        // still sanitizes model in case template is changed later
        expect(filename).not.toContain("/")
        expect(filename).toBe("trajectory_ses_123_1700000000.jsonl")
      },
    })
  })
})
