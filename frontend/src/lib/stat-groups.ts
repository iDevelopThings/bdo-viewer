import type {StatGroup} from "@bindings/bdo-viewer/internal/stats";
import type {MaybeReadonly} from "@/types.ts";

// StatBuilder's Section()/NamedSection() split: an untitled group (Card or the
// main Effects group - AP/DP/Accuracy/...) is meant to render as a flat row of
// StatCards; every group extended from a bdoextract EffectGroup carries a real
// Title (Enhancement Effect, Set Effect, Stats, Hidden, Caphras Enhancement,
// ...) and renders as its own label:value section instead.
export function flatStats(groups: MaybeReadonly<StatGroup[]> | null | undefined) {
	return (groups ?? []).filter(g => !g.title).flatMap(g => g.stats ?? []);
}

export function namedGroups(groups: MaybeReadonly<StatGroup[]> | null | undefined) {
	return (groups ?? []).filter(g => !!g.title && (g.stats?.length ?? 0) > 0);
}
