import { useState, useCallback, useRef } from 'react';
import { vantageClient } from '../lib/vantageClient';

export interface CreationJob {
  job_id: number;
  prompt: string;
  status: 'scripting' | 'voicing' | 'visualizing' | 'composing' | 'completed' | 'error';
  progress: number;
  note?: string;
  broadcast_id?: number;
  created_at?: string;
  updated_at?: string;
}

export function useCreationJob() {
  const [activeJob, setActiveJob] = useState<CreationJob | null>(null);
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const pollTimerRef = useRef<any>(null);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const registerCreationJob = useCallback(
    async (prompt: string) => {
      stopPolling();
      setIsCreating(true);
      setError(null);

      try {
        // Register job via POST /create endpoint
        const initialRes = await vantageClient.createContentJob(prompt);
        const jobId = initialRes.job_id;

        const jobObj: CreationJob = {
          job_id: jobId,
          prompt,
          status: initialRes.status || 'scripting',
          progress: initialRes.progress || 20,
          note: initialRes.note || 'Registered creation job on Vantage pipeline',
        };

        setActiveJob(jobObj);

        // Poll GET /me/creation-jobs/:id until complete
        pollTimerRef.current = setInterval(async () => {
          try {
            const currentJobStatus = await vantageClient.getCreationJobStatus(jobId);
            setActiveJob(currentJobStatus);

            if (currentJobStatus.status === 'completed' || currentJobStatus.status === 'error') {
              setIsCreating(false);
              stopPolling();
            }
          } catch (err: any) {
            console.warn('[Creation Job Polling Error]:', err);
          }
        }, 2500);

        return jobId;
      } catch (err: any) {
        setIsCreating(false);
        setError(err.message || 'Failed to start creation job');
        throw err;
      }
    },
    [stopPolling]
  );

  return {
    activeJob,
    isCreating,
    error,
    registerCreationJob,
    stopPolling,
    clearActiveJob: () => setActiveJob(null),
  };
}
