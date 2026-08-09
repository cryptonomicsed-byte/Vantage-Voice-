/**
 * Real swarm/panel orchestration via herdr ("terminal workspace manager
 * for AI coding agents"), confirmed installed and controllable on
 * Hostinger (10.88.0.1) over the existing WireGuard tunnel -- not
 * available on this box (Contabo, where Vantage-Voice- itself runs).
 *
 * Topology: this process (Contabo) SSHes to Hostinger to drive herdr's
 * socket API (`herdr agent start ...`), which spawns a real terminal pane
 * on Hostinger. That pane's own command SSHes right back to Contabo to
 * run the real work (currently: the real oh-my-pi coding agent, same
 * DeepSeek-backed instance already proven working elsewhere this
 * session) and redirects its output to a file on Contabo. Since this
 * process already runs on Contabo, reading that file back is a plain
 * local fs read -- no third hop needed.
 *
 * herdr auto-closes a pane once its process exits, so `herdr agent read`
 * loses the output in a race against a fast task. File-redirect + local
 * poll is the reliable path, verified live before wiring this in.
 */
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const HOSTINGER_TUNNEL_HOST = process.env.HOSTINGER_TUNNEL_HOST || '10.88.0.1';
const CONTABO_TUNNEL_HOST = process.env.CONTABO_TUNNEL_HOST || '10.88.0.2';
const OMP_DEEPSEEK_API_KEY = process.env.OMP_DEEPSEEK_API_KEY || '';
const SSH_OPTS = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8', '-o', 'StrictHostKeyChecking=accept-new'];

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40) || 'task';
}

/**
 * Spawns a real herdr-managed terminal pane on Hostinger running the real
 * oh-my-pi coding agent (on Contabo) for a task, and waits for its real
 * output. The owner can literally watch the pane appear in their own
 * herdr session while this runs.
 */
export async function spawnSwarmCodingTask(taskName: string, prompt: string, timeoutMs = 90_000): Promise<string> {
  if (!OMP_DEEPSEEK_API_KEY) throw new Error('OMP_DEEPSEEK_API_KEY is not set -- cannot run the swarm coding agent');
  const name = `${safeName(taskName)}-${Date.now()}`;
  const outFile = `/tmp/herdr-${name}.out`;

  const remoteCmd = [
    'export PATH=$HOME/.bun/bin:$PATH;',
    'mkdir -p /tmp/herdr-task &&',
    'cd /tmp/herdr-task &&',
    `DEEPSEEK_API_KEY=${OMP_DEEPSEEK_API_KEY}`,
    'bun /opt/oh-my-pi/packages/coding-agent/src/cli.ts',
    JSON.stringify(prompt),
    '--print --model deepseek/deepseek-v4-flash --no-pty',
    `> ${outFile} 2>&1`,
  ].join(' ');

  const herdrCmd = `herdr agent start ${name} --cwd /tmp -- ssh root@${CONTABO_TUNNEL_HOST} ${JSON.stringify(remoteCmd)}`;

  try {
    await execFileAsync('ssh', [...SSH_OPTS, `root@${HOSTINGER_TUNNEL_HOST}`, herdrCmd], { timeout: 15_000 });
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

/** Real list of currently active herdr-managed agent panes on Hostinger. */
export async function listSwarmPanels(): Promise<any[]> {
  try {
    const { stdout } = await execFileAsync('ssh', [...SSH_OPTS, `root@${HOSTINGER_TUNNEL_HOST}`, 'herdr agent list'], { timeout: 10_000 });
    const parsed = JSON.parse(stdout);
    return parsed?.result?.agents || [];
  } catch (err: any) {
    throw new Error(`Failed to list herdr panels: ${err?.message || err}`);
  }
}
