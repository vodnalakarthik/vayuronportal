import { initializeRuntime } from '../src/runtime.js';
import {
  failCandidateMatchWorkflow,
  finalizeCandidateMatchWorkflow,
  prepareCandidateMatchWorkflow,
  processCandidateMatchWorkflowJob
} from '../src/services/aiWorkflow.js';

async function prepareStep(input) {
  'use step';
  await initializeRuntime();
  return prepareCandidateMatchWorkflow(input);
}

async function processJobStep(input) {
  'use step';
  await initializeRuntime();
  return processCandidateMatchWorkflowJob(input);
}

async function finalizeStep(input) {
  'use step';
  await initializeRuntime();
  return finalizeCandidateMatchWorkflow(input);
}

async function failStep(input) {
  'use step';
  await initializeRuntime();
  return failCandidateMatchWorkflow(input);
}

export async function candidateMatchWorkflow(input) {
  'use workflow';

  try {
    const plan = await prepareStep(input);

    for (const job of plan.jobs) {
      const result = await processJobStep({
        runId: input.runId,
        candidateId: input.candidateId,
        actor: input.actor,
        ...job
      });

      if (!result.continue) break;
    }

    await finalizeStep(input);
  } catch (error) {
    await failStep({ runId: input.runId, error: error.message });
    throw error;
  }
}
