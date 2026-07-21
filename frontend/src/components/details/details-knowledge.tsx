import {useDetail} from "@/state/detail.tsx";
import {ChipList, DetailsHeader, DetailsItemList, DetailsSection, DetailsShell, SectionSubtitle} from "@/components/details/details-components.tsx";
import {GameText} from "@/lib/game-text.tsx";
import {DetailsStats} from "@/components/details/stats.tsx";
import {goToURN} from "@/state/panels.ts";
import {isKnowledgeTheme, isKnowledgeEntry} from "@/state/sources/sources.ts";

export function KnowledgeDetails() {
	const [, d] = useDetail();

	if (isKnowledgeTheme(d.entry)) {
		return <KnowledgeThemeDetails />;
	}

	if (!isKnowledgeEntry(d.entry)) {
		return null;
	}

	const e = d.entry.value;

	return (
		<DetailsShell
			header={(
				<DetailsHeader
					title={e.name}
					urn={d.entry.urn}
					lines={{
						"ID" : d.entry.urn,
					}}
				/>
			)}
		>
			<DetailsSection expandable={false} borderTop>
				<SectionSubtitle title={"Categories"} />
				<ChipList
					items={d.knowledge?.breadcrumbs?.map(b => ({urn : b.urn, name : b.name}))}
					onClick={(item, pinned) => goToURN(item.urn, {title : item.name, prefer : "navigation", pinned})}
				/>
			</DetailsSection>

			<DetailsSection expandable title={"Description"} borderTop>
				<GameText text={e.description} textClassName={"text-xs"} />
			</DetailsSection>

			{e.acquisition && (
				<DetailsSection title={"Acquisition"} borderTop>
					<GameText text={e.acquisition} textClassName={"text-xs"} />
				</DetailsSection>
			)}

			<DetailsStats />

			{e.item && <DetailsSection title={"Knowledge Item"} borderTop>
				<DetailsItemList itemUrns={[e.item]} />
			</DetailsSection>}

			{e.character && <DetailsSection title={"About"} borderTop>
				<ChipList
					items={[{urn : e.character, name : e.name ?? "Character"}]}
					onClick={(item, pinned) => goToURN(item.urn, {title : item.name, prefer : "navigation", pinned})}
				/>
			</DetailsSection>}
		</DetailsShell>
	);
}

function KnowledgeThemeDetails() {
	const [, d] = useDetail();

	if (!isKnowledgeTheme(d.entry)) {
		return null;
	}

	const theme       = d.entry.value;
	const childThemes = d.knowledge?.themes ?? [];
	const entries     = d.knowledge?.entries ?? [];

	return (
		<DetailsShell
			header={(
				<DetailsHeader
					title={theme.name ?? `#${theme.key}`}
					urn={d.entry.urn}
					lines={{
						"ID" : d.entry.urn,
					}}
				/>
			)}
		>
			<DetailsSection expandable={false} borderTop>
				<SectionSubtitle title={"Categories"} />
				<ChipList
					items={d.knowledge?.breadcrumbs?.map(b => ({urn : b.urn, name : b.name}))}
					onClick={(item, pinned) => goToURN(item.urn, {title : item.name, prefer : "navigation", pinned})}
				/>
			</DetailsSection>

			{childThemes.length > 0 && (
				<DetailsSection title={`Subcategories (${childThemes.length})`} borderTop>
					<ChipList
						items={childThemes.map(t => ({urn : t.urn, name : t.name ?? `#${t.key}`}))}
						onClick={(item, pinned) => goToURN(item.urn, {title : item.name, prefer : "navigation", pinned})}
					/>
				</DetailsSection>
			)}

			{entries.length > 0 && (
				<DetailsSection title={`Entries (${entries.length})`} borderTop>
					<ChipList
						items={entries.map(e => ({urn : e.urn, name : e.name}))}
						onClick={(item, pinned) => goToURN(item.urn, {title : item.name, prefer : "navigation", pinned})}
					/>
				</DetailsSection>
			)}

			{theme.item && (
				<DetailsSection title={"Knowledge Item"} borderTop>
					<DetailsItemList itemUrns={[theme.item]} />
				</DetailsSection>
			)}
		</DetailsShell>
	);
}
