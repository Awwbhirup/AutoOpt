/**
 * The search methods as the app presents them: a label, what kind of search
 * it is, and whether it is a control. The engine owns the list of what can run
 * (the service's /methods); this only says how to show each one, and a name it
 * does not know is still shown, by its own name.
 */

export interface MethodMeta {
  label: string;
  /** A control is reported beside the others, marked, so a mean is not read as a method's. */
  baseline: boolean;
  llm: boolean;
  note: string;
}

export const METHOD_META: Record<string, MethodMeta> = {
  fixed_pipeline: {
    label: "Fixed pipeline",
    baseline: true,
    llm: false,
    note: "Textbook pass order to a fixed point. No search.",
  },
  random_baseline: {
    label: "Random baseline",
    baseline: true,
    llm: false,
    note: "Picks among legal rewrites at random.",
  },
  greedy: {
    label: "Greedy",
    baseline: false,
    llm: false,
    note: "Takes the cheapest improving rewrite each step.",
  },
  astar: {
    label: "A* search",
    baseline: false,
    llm: false,
    note: "Best-first over rewrite sequences under a node budget.",
  },
  hill_climbing: {
    label: "Hill climbing",
    baseline: false,
    llm: false,
    note: "Climbs with sideways moves across cost-neutral ground.",
  },
  simulated_annealing: {
    label: "Simulated annealing",
    baseline: false,
    llm: false,
    note: "Accepts some worse moves early, fewer as it cools.",
  },
  llm: { label: "LLM", baseline: false, llm: true, note: "A model proposes each rewrite." },
  llm_small: { label: "LLM small", baseline: false, llm: true, note: "A smaller model proposes." },
  llm_large: { label: "LLM large", baseline: false, llm: true, note: "A larger model proposes." },
};

/** The methods a suite starts with ticked: both controls and the two main searches. */
export const DEFAULT_SUITE_METHODS = ["random_baseline", "fixed_pipeline", "greedy", "astar"];

/** Rule-based methods in the order a picker lists them when the service cannot be asked. */
export const RULE_METHODS = [
  "greedy",
  "astar",
  "hill_climbing",
  "simulated_annealing",
  "fixed_pipeline",
  "random_baseline",
];

export function methodMeta(name: string): MethodMeta {
  return (
    METHOD_META[name] ?? {
      label: name.replace(/_/g, " "),
      baseline: false,
      llm: name.startsWith("llm"),
      note: "",
    }
  );
}

export function methodLabel(name: string): string {
  return methodMeta(name).label;
}
