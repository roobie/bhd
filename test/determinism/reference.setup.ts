// Vitest globalSetup for the browser project. It runs once on Node, runs the shared scenario, and
// hands the result to the browser tests, which must reproduce it exactly. Nothing is pinned on disk:
// cross-runtime equality (Node vs V8, SpiderMonkey, JavaScriptCore) is the determinism spec.

import type { TestProject } from 'vitest/node';
import { runScenario, type ScenarioResult } from './scenario.ts';

declare module 'vitest' {
  export interface ProvidedContext {
    /** The scenario result computed on Node; browsers assert their own run equals it. */
    nodeScenario: ScenarioResult;
  }
}

export function setup(project: TestProject): void {
  project.provide('nodeScenario', runScenario());
}
