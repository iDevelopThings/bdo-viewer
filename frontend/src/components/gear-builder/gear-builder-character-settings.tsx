import {Fragment} from "react";
import {SetLevel, UpdateMasteryConfig} from "@bindings/bdo-viewer/internal/gear/builderservice.ts";
import type {MasteryConfigSet, MasteryData} from "@bindings/bdo-viewer/internal/gear";
import {Input} from "@/components/ui/input.tsx";
import {Label} from "@/components/ui/label.tsx";
import {Select, SelectContent, SelectItem, SelectTrigger, SelectValue} from "@/components/ui/select.tsx";
import {useGearBuilderStore} from "@/components/gear-builder/gear-builder-store.ts";
import {LifeSkillType, LifeSkillTypeInfos} from "@/lib/types/life-skill-types.gen.ts";
import {LifeSkillGradeInfos, LifeSkillGradeValues} from "@/lib/types/life-skill-grades.gen.ts";
import {useDebounce} from "@/utils.tsx";

// The gear-builder life skills — the LifeSkillType members that carry a gear
// mastery stat, in wire order.
const GEAR_SKILLS = Object.values(LifeSkillTypeInfos).filter(info => info.masteryStat);

// The selectable mastery grades (Beginner..Guru), excluding the Unknown sentinel.
const GRADES = LifeSkillGradeValues
	.map(v => LifeSkillGradeInfos[v])
	.filter(g => g.value >= 0);

const GRADE_MIN_MAXES = GRADES.reduce((acc, g) => {
	acc[g.value] = {min: 0, max: g.maxLevel - g.minLevel};
	return acc;
}, {} as Record<number, {min: number, max: number}>);

export function GearBuilderCharacterSettings() {
	const [builder, s] = useGearBuilderStore();
	const mastery      = (builder.gearMastery ?? {});

	const updateDebounced = useDebounce((conf: MasteryConfigSet) => {
		void UpdateMasteryConfig(conf);
	}, 300);

	const save = (skill: LifeSkillType, patch: Partial<MasteryData>) => {
		const cur: MasteryData       = mastery?.[skill] ?? {rank : 0, lvl : 0};
		const next: MasteryConfigSet = {...mastery, [skill] : {...cur, ...patch}};

		s.gearMastery = next;

		updateDebounced(next);
	};

	const setLevelDebounced = useDebounce((level: number) => {
		void SetLevel(level);
	}, 300);

	const saveLevel = (level: number) => {
		const next = Math.max(1, level);
		s.level    = next;
		setLevelDebounced(next);
	};


	return (
		<section className={"flex flex-col gap-3 select-none"}>
			<div className={"flex flex-col gap-1"}>
				<h2 className={"text-sm font-semibold text-zinc-200"}>Gear Builder Character</h2>
				<p className={"text-xs text-zinc-400"}>
					Character level and per-life-skill mastery — drives the gear builder's class curves and mastery-point calc.
				</p>
			</div>
			<div className={"flex items-center gap-2"}>
				<Label className={"w-24 text-xs text-muted-foreground"}>Character Level</Label>
				<Input
					type={"number"}
					min={1}
					value={builder.level ?? 65}
					onChange={e => saveLevel(parseInt(e.target.value, 10) || 1)}
					className={"h-8 w-24 text-center"}
				/>
			</div>
			<div className={"grid w-fit grid-cols-[6rem_10rem_6rem] items-center gap-x-2 gap-y-1.5"}>
				<span className={"col-span-3 mt-1 text-[10px] uppercase tracking-wide text-zinc-500"}>Life Skill Mastery</span>
				<span />
				<Label className={"text-[10px] uppercase tracking-wide text-muted-foreground text-center"}>Grade</Label>
				<Label className={"text-[10px] uppercase tracking-wide text-muted-foreground text-center"}>Level</Label>
				{GEAR_SKILLS.map(info => {
					const m = mastery?.[info.value];
					return (
						<Fragment key={info.value}>
							<Label className={"text-xs text-muted-foreground"}>{info.title}</Label>

							<Select value={m?.rank ?? 0} onValueChange={(v: number) => save(info.value, {rank : v})}>
								<SelectTrigger size={"sm"} className={"w-full"}>
									<SelectValue>
										{(v: number | null) => GRADES.find(g => g.value === v)?.name ?? "Unknown"}
									</SelectValue>
								</SelectTrigger>
								<SelectContent>
									{GRADES.map(g => (
										<SelectItem key={g.value} value={g.value}>{g.name}</SelectItem>
									))}
								</SelectContent>
							</Select>

							<Input
								type={"number"}
								min={GRADE_MIN_MAXES[m?.rank ?? 0]?.min ?? 0}
								max={GRADE_MIN_MAXES[m?.rank ?? 0]?.max ?? 0}
								value={m?.lvl ?? 0}
								onChange={e => save(info.value, {lvl : parseInt(e.target.value, 10) || 0})}
								className={"h-8 text-center"}
							/>
						</Fragment>
					);
				})}
			</div>
		</section>
	);
}
