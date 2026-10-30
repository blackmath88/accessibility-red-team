// Experimental investigation slice (ADR-0015). Shape of a designer proposal (hypotheses plus one executable probe).
import { z } from "zod";

export const HypothesisSchema = z.object({ id: z.string().min(1).max(80), statement: z.string().min(1).max(1500), prediction: z.string().min(1).max(1500), falsifier: z.string().min(1).max(1500) });
export const ProposalSchema = z.object({
  hypotheses: z.array(HypothesisSchema).min(3).max(3),
  probe: z.object({ question: z.string().min(1).max(1500), falsifier: z.string().min(1).max(2000), controls: z.array(z.string()).max(10), limitations: z.array(z.string()).max(12), code: z.string().min(50).max(12_000) }),
  revisionNote: z.string().max(4000).optional(),
});
