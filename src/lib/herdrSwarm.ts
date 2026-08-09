/**
 * Real swarm/panel orchestration via herdr ("terminal workspace manager
 * for AI coding agents") -- installed directly on this box (Contabo,
 * where Vantage-Voice- itself runs) as of this session, so pane control
 * and the real work it runs are both local. Earlier version of this
 * module double-hopped through Hostinger (the only place herdr existed
 * at the time) via SSH; that's gone now that herdr runs here too --
 * confirmed live before rewriting.
 *
 * herdr auto-closes a pane once its process exits, so `herdr agent read`
 * loses the output in a race against a fast task. File-redirect + local
 * poll is the reliable path, verified live.
 */
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const OMP_DEEPSEEK_API_KEY = process.env.OMP_DEEPSEEK_API_KEY || '';

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40) || 'task';
}

/**
 * Spawns a real, local herdr-managed terminal pane running the real
 * oh-my-pi coding agent for a task, and waits for its real output.
 */
export async function spawnSwarmCodingTask(taskName: string, prompt: string, timeoutMs = 90_000): Promise<string> {
  if (!OMP_DEEPSEEK_API_KEY) throw new Error('OMP_DEEPSEEK_API_KEY is not set -- cannot run the swarm coding agent');
  const name = `${safeName(taskName)}-${Date.now()}`;
  const outFile = `/tmp/herdr-${name}.out`;

  const localCmd = [
    'export PATH=$HOME/.bun/bin:$PATH;',
    'mkdir -p /tmp/herdr-task &&',
    'cd /tmp/herdr-task &&',
    `DEEPSEEK_API_KEY=${OMP_DEEPSEEK_API_KEY}`,
    'bun /opt/oh-my-pi/packages/coding-agent/src/cli.ts',
    JSON.stringify(prompt),
    '--print --model deepseek/deepseek-v4-flash --no-pty',
    `> ${outFile} 2>&1`,
  ].join(' ');

  try {
    await execFileAsync('herdr', ['agent', 'start', name, '--cwd', '/tmp', '--', 'bash', '-c', localCmd], { timeout: 15_000 });
  } catch (err: any) {
    throw new Error(`Failed to spawn herdr swarm pane: ${err?.message || err}`);
  }

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    if (fs.existsSync(outFile)) {
      const content = fs.readFileSync(outFile, 'utf-8').trim();
      if (content) return content;
    }
  }
  throw new Error(`Swarm coding task "${taskName}" timed out after ${timeoutMs}ms waiting for real output`);
}

/** Real list of currently active local herdr-managed agent panes. */
export async function listSwarmPanels(): Promise<any[]> {
  try {
    const { stdout } = await execFileAsync('herdr', ['agent', 'list'], { timeout: 10_000 });
    const parsed = JSON.parse(stdout);
    return parsed?.result?.agents || [];
  } catch (err: any) {
    throw new Error(`Failed to list herdr panels: ${err?.message || err}`);
  }
}
