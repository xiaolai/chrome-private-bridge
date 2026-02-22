const COMMAND_TIMEOUT = 15_000

export type RunResult = { stdout: string; stderr: string; exitCode: number }

export async function runCommand(
  cmd: string,
  args: string[],
  opts?: { input?: Buffer | string; timeout?: number; allowNonZeroExit?: boolean },
): Promise<RunResult> {
  const proc = Bun.spawn([cmd, ...args], {
    stdin: opts?.input != null ? "pipe" : "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })

  if (opts?.input != null && proc.stdin) {
    const data = typeof opts.input === "string" ? new TextEncoder().encode(opts.input) : opts.input
    proc.stdin.write(data)
    proc.stdin.end()
  }

  const timeout = opts?.timeout ?? COMMAND_TIMEOUT
  const timer = setTimeout(() => proc.kill(), timeout)

  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ])
    if (!opts?.allowNonZeroExit && exitCode !== 0) {
      const details = stderr.trim() || stdout.trim()
      throw new Error(`Command failed (${cmd}): exit ${exitCode}${details ? `\n${details}` : ""}`)
    }
    return { stdout, stderr, exitCode }
  } finally {
    clearTimeout(timer)
  }
}

export async function commandExists(cmd: string): Promise<boolean> {
  const which = process.platform === "win32" ? "where" : "which"
  const result = await runCommand(which, [cmd], { allowNonZeroExit: true, timeout: 5000 })
  return result.exitCode === 0 && result.stdout.trim().length > 0
}
