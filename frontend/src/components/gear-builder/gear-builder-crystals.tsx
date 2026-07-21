import {Gem, Lock, Plus} from "lucide-react";
import {ClearCrystal, SetCrystal} from "@bindings/bdo-viewer/internal/gear/builderservice.ts";
import {type SimpleCrystalSlot} from "@bindings/bdo-viewer/internal/gear/models.ts";
import {gearBuilderStore} from "@/components/gear-builder/gear-builder-store.ts";
import {ItemSlotButton} from "@/components/gear-builder/gear-slot-button.tsx";
import {EntryListComboPicker} from "@/components/entry-list/entry-list-combo-picker.tsx";
import {ComboboxTriggerNoChevron} from "@/components/ui/combobox.tsx";
import {cn} from "@/lib/utils.ts";
import {CrystalPresetSlots, CrystalPresetSlotInfos, CrystalPresetSlotValues, type CrystalPresetSlot,} from "@/lib/types/crystal-preset-slots.gen.ts";
import {getGradeColor} from "@/lib/types/item-grades.ts";
import {EffectSections} from "@/components/details/effects.tsx";
import {EntryIconImage} from "@/lib/entry-icon.tsx";
import {useSnapshot} from "valtio/react";
import {useMemo} from "react";
import {CRYSTAL_FILTERS, crystalPickerParams} from "@/components/gear-builder/crystal-filters.tsx";
import {EntryFilterProvider} from "@/components/entry-list/filters/entry-filter-provider.tsx";

const S = CrystalPresetSlots;

// In-game transfusion board: diamond of free slots, hearts at the top corners,
// LoML at the bottom corners, costume in the centre. null = spacer.
const MAIN_BOARD: (CrystalPresetSlot | null)[][] = [
	[S.HeartL, null, S.Base0, null, S.HeartR],
	[null, S.Base1, S.Base2, S.Base3, null],
	[S.Base4, S.Base5, S.Costume, S.Base6, S.Base7],
	[null, S.Base8, S.Base9, S.Base10, null],
	[S.LoMLL, null, S.Base11, null, S.LoMLR],
];

const DAWN_SLOT_IDS = CrystalPresetSlotValues.filter(id => CrystalPresetSlotInfos[id].kind === "dawn");

function slotById(slots: readonly SimpleCrystalSlot[], id: CrystalPresetSlot): SimpleCrystalSlot | undefined {
	return slots.find(s => s.id === id);
}

function CrystalSocket(
	{
		slot,
		label,
		crystalGroup,
		size = "lg",
	}: {
		slot: SimpleCrystalSlot | undefined
		label?: string
		crystalGroup?: number
		size?: "md" | "lg"
	}
) {
	const box = size === "lg" ? "h-12 w-12" : "h-10 w-10";

	if (!slot) {
		return <div className={box} />;
	}

	const title = label
		? (slot.unlocked ? label : `Requires Kharazad or Preonne ${label} equipped`)
		: undefined;

	if (!slot.unlocked) {
		return (
			<div
				title={title}
				className={cn(
					box,
					"relative flex items-center justify-center rounded-md border border-surface-border",
					"bg-surface-1 opacity-50 cursor-not-allowed",
				)}
			>
				<Lock className={"size-3.5 text-fg-muted"} />
			</div>
		);
	}

	if (slot.item) {
		return (
			<ItemSlotButton
				data-testid={`crystal-socket-${slot.id}`}
				item={slot.item}
				size={size}
				slotTitle={slot.item.title}
				onRemove={() => void ClearCrystal(slot.id)}
			/>
		);
	}

	return (
		<EntryListComboPicker
			onSelect={e => e ? void SetCrystal(slot.id, e.urn) : undefined}
			trigger={
				<ComboboxTriggerNoChevron
					nativeButton={false}
					render={
						<ItemSlotButton
							data-testid={`crystal-socket-${slot.id}`}
							size={size}
							slotTitle={title ?? "Add crystal"}
							placeholder={<Plus className={"size-3.5 text-fg-muted"} />}
						/>
					}
				/>
			}
			placeholder={"Search crystals…"}
			// The shared constraints live on the provider; only the socket's own family varies.
			params={{
				filters : {
					crystals : {
						...(crystalGroup != null ? {crystalGroup} : {}),
					},
				},
			}}
		/>
	);
}

function PresetSocket({id, slots, size}: {
	id: CrystalPresetSlot
	slots: readonly SimpleCrystalSlot[]
	size?: "md" | "lg"
}) {
	const info    = CrystalPresetSlotInfos[id];
	const labeled = info.kind !== "base";
	return (
		<CrystalSocket
			slot={slotById(slots, id)}
			label={labeled ? info.title : undefined}
			crystalGroup={info.crystalGroup}
			size={size}
		/>
	);
}

export function GearBuilderCrystals() {
	const {crystals, crystalGroups, crystalEffects} = useSnapshot(gearBuilderStore);

	const slots = (crystals ?? []) as SimpleCrystalSlot[];

	// Rebuilt as the preset fills up, so a family hitting its cap drops out of every socket's list.
	const params = useMemo(() => crystalPickerParams(crystalGroups ?? []), [crystalGroups]);

	const itemsByGroup = useMemo(() => {
		const m = new Map<number, NonNullable<SimpleCrystalSlot["item"]>[]>();
		for (const slot of crystals ?? []) {
			if (!slot.item) {
				continue;
			}
			const key = slot.item.extra?.crystalGroup as number | undefined;
			if (key == null) {
				continue;
			}
			const list = m.get(key) ?? [];
			list.push(slot.item);
			m.set(key, list);
		}
		return m;
	}, [crystals]);

	const hasEffects = (crystalEffects?.length ?? 0) > 0;
	const hasGroups  = (crystalGroups?.length ?? 0) > 0;

	return (
		<EntryFilterProvider params={params} controls={CRYSTAL_FILTERS} persistKey={"crystals"}>
			<div className={"flex h-full flex-row gap-4 overflow-auto"}>
				<div className={"flex flex-1 min-w-96 flex-col items-center gap-6 overflow-hidden p-12"}>

					{/* Main board — diamond layout matching the in-game window */}
					<div className={"relative flex items-center justify-center"}>
						<div className={"absolute inset-[8%] rounded-full border border-surface-border/60"} />
						<div className={"absolute inset-[28%] rounded-full border border-[#654f34]/50"} />
						<div className={"absolute inset-[18%] bg-radial-[at_50%_50%] from-surface-3/25 to-transparent to-70%"} />

						<div className={"relative grid grid-cols-5 gap-2 p-2"}>
							{MAIN_BOARD.flatMap((row, ri) =>
								row.map((id, ci) => (
									<div key={`${ri}-${ci}`} className={"flex items-center justify-center"}>
										{id != null
											? <PresetSocket id={id} slots={slots} />
											: <div className={"h-12 w-12"} />}
									</div>
								)),
							)}
						</div>
					</div>

					{/* Dawn / accessory row — under the board like the in-game bar */}
					<div className={"flex flex-col items-center gap-2"}>
						<div className={"flex flex-row gap-2"}>
							{DAWN_SLOT_IDS.map(id => (
								<PresetSocket key={id} id={id} slots={slots} size={"md"} />
							))}
						</div>
					</div>
				</div>

				<div className={"flex min-w-20 max-w-72 w-72 flex-1 flex-col gap-4 overflow-y-scroll border-l border-surface-border p-4"}>
					{!hasEffects && !hasGroups ? (
						<div className={"text-sm text-fg-subtle"}>No crystals equipped</div>
					) : (
						<>
							{hasEffects && <EffectSections groups={crystalEffects ?? []} />}

							{hasGroups && (
								<div className={"flex flex-col gap-2"}>
									<div className={"text-xs font-medium uppercase tracking-wide text-fg-muted"}>
										Crystals
									</div>
									<ul className={"flex flex-col gap-3 text-sm"}>
										{(crystalGroups ?? []).map(g => {
											const over  = g.max < 1000 && g.used > g.max;
											const full  = g.max < 1000 && g.used >= g.max;
											const items = itemsByGroup.get(g.key) ?? [];
											return (
												<li key={g.key} className={"flex flex-col gap-1"}>
													<div
														className={cn(
															"flex items-center justify-between gap-2 rounded px-2 py-1",
															over && "bg-destructive/15 text-destructive",
															!over && full && "bg-surface-2",
														)}
													>
														<span className={"truncate font-medium text-amber-300"}>{g.name}</span>
														<span className={"shrink-0 tabular-nums text-fg-muted"}>
															{g.used}{g.max < 1000 ? `/${g.max}` : ""}
														</span>
													</div>
													<ul className={"flex flex-col gap-2 pl-1"}>
														{items.map((it, i) => {
															const gradeColor = getGradeColor(it.extra?.grade);
															const effects    = it.extra?.effects as string | undefined;
															return (
																<li
																	key={`${it.urn}-${i}`}
																	className={"flex items-start gap-2"}
																>
																	<EntryIconImage
																		urn={it.urn}
																		grade={it.extra?.grade}
																		imageClass={"size-5"}
																		className={"mt-0.5 shrink-0"}
																	/>
																	<div className={"min-w-0 flex-1"}>
																		<div
																			className={"truncate text-sm font-medium"}
																			style={gradeColor ? {color : gradeColor.toString()} : undefined}
																			title={it.title}
																		>
																			{it.title}
																		</div>
																		{effects && (
																			<div className={"text-xs leading-snug text-fg-muted"}>
																				{effects}
																			</div>
																		)}
																	</div>
																</li>
															);
														})}
													</ul>
												</li>
											);
										})}
									</ul>
								</div>
							)}
						</>
					)}
				</div>
			</div>
		</EntryFilterProvider>
	);
}
