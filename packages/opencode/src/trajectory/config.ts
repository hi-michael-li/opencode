export namespace TrajectoryConfig {
  export interface Options {
    enabled: boolean
    outputPath: string
    filenameTemplate: string
    bufferSize: number
    flushStrategy: "immediate" | "end_of_stream" | "buffered"
    captureStreamEvents: boolean
  }

  const DEFAULTS: Options = {
    enabled: true,
    outputPath: ".opencode/trajectories",
    filenameTemplate: "trajectory_{sessionID}_{timestamp}.jsonl",
    bufferSize: 1000,
    flushStrategy: "end_of_stream",
    captureStreamEvents: true,
  }

  export function get(): Options {
    return { ...DEFAULTS }
  }

  export function resolveFilename(
    sessionID: string,
    context: {
      agent: string
      model: string
      timestamp: number
      identifier?: string
    },
  ): string {
    const safeModel = context.model.replace(/[\\/]/g, "-")
    const candidate = context.identifier ?? process.env["OPENCODE_TRAJECTORY_INSTANCE_ID"]?.trim()
    const identifier = candidate && candidate.length > 0 ? candidate : sessionID
    const template = get().filenameTemplate
    return template
      .replaceAll("{sessionID}", identifier)
      .replaceAll("{agent}", context.agent)
      .replaceAll("{model}", safeModel)
      .replaceAll("{timestamp}", String(context.timestamp))
  }
}
