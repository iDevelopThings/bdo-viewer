import {useDetail} from "@/state/detail.tsx";
import {ChipList, DetailsHeader, DetailsItemList, DetailsSection, SectionSubtitle} from "@/components/details/details-components.tsx";
import {getEntryKey} from "@/state/detail-store.tsx";
import {KnowledgeEntry} from "@bindings/github.com/idevelopthings/bdo-data-extractor/src/model";
import {GameText} from "@/lib/game-text.tsx";
import {DetailsStats} from "@/components/details/stats.tsx";
import {KnowledgeURN} from "@/lib/urn.ts";
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
		<div
			className="flex flex-col grow "
		>
			<DetailsHeader
				title={e.name}
				icon={e.image}
				lines={{
					"ID" : getEntryKey(d.entry).toString(),
				}}
			/>
			<div className={"gap-8 pb-8"}>
				<DetailsSection expandable={false} borderTop>
					<SectionSubtitle title={"Categories"} />
					<ChipList
						items={d.knowledge?.breadcrumbs?.map(b => ({id : b.key, name : b.name}))}
						onClick={item => {
							const breadcrumb = d.knowledge.breadcrumbs[item.index];
							if (breadcrumb) {
								goToURN(KnowledgeURN.new("theme", breadcrumb.key), {title : breadcrumb.name, prefer : "navigation"});
							}

						}}
					/>

				</DetailsSection>

				<DetailsSection expandable title={"Description"} borderTop>
					<GameText text={e.description} textClassName={"text-xs"} />
				</DetailsSection>

				<DetailsStats />

				{e.item && <DetailsSection title={"Knowledge Item"} borderTop>
					<DetailsItemList itemUrns={[e.item]} />
				</DetailsSection>}

				{e.character && <DetailsSection title={"About"} borderTop>
					<ChipList
						items={[{id : 0, name : e.name}]}
						onClick={() => goToURN(e.character!, {title : e.name, prefer : "navigation"})}
					/>
				</DetailsSection>}

			</div>

		</div>
	);
}

function KnowledgeThemeDetails() {
	const [, d] = useDetail();

	if (!isKnowledgeTheme(d.entry)) {
		return null;
	}

	const theme = d.entry.value;
	const childThemes = d.knowledge?.themes ?? [];
	const entries = d.knowledge?.entries ?? [];

	return (
		<div className="flex flex-col grow">
			<DetailsHeader
				title={theme.name ?? `#${theme.key}`}
				lines={{
					"ID" : theme.key.toString(),
				}}
			/>
			<div className={"gap-8 pb-8"}>
				<DetailsSection expandable={false} borderTop>
					<SectionSubtitle title={"Categories"} />
					<ChipList
						items={d.knowledge?.breadcrumbs?.map(b => ({id : b.key, name : b.name}))}
						onClick={item => {
							const breadcrumb = d.knowledge?.breadcrumbs?.[item.index];
							if (!breadcrumb) return;
							goToURN(KnowledgeURN.new("theme", breadcrumb.key), {title : breadcrumb.name, prefer : "navigation"});
						}}
					/>
				</DetailsSection>

				{childThemes.length > 0 && (
					<DetailsSection title={`Subcategories (${childThemes.length})`} borderTop>
						<ChipList
							items={childThemes.map(t => ({id : t.key, name : t.name ?? `#${t.key}`}))}
							onClick={item => {
								const child = childThemes[item.index];
								goToURN(KnowledgeURN.new("theme", child.key), {title : child.name, prefer : "navigation"});
							}}
						/>
					</DetailsSection>
				)}

				{entries.length > 0 && (
					<DetailsSection title={`Entries (${entries.length})`} borderTop>
						<ChipList
							items={entries.map(e => ({id : e.key, name : e.name}))}
							onClick={item => {
								const entry = entries[item.index] as KnowledgeEntry | undefined;
								if (!entry) return;
								goToURN(KnowledgeURN.new("entry", entry.key), {title : entry.name});
							}}
						/>
					</DetailsSection>
				)}

				{theme.item && (
					<DetailsSection title={"Knowledge Item"} borderTop>
						<DetailsItemList itemUrns={[theme.item]} />
					</DetailsSection>
				)}
			</div>
		</div>
	);
}

