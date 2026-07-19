import {GearSlotButton, GearSlotButtonVariant} from "@/components/gear-builder/gear-slot-button.tsx";
import {SlotName} from "@bindings/github.com/idevelopthings/bdo-data-extractor/src/model";

// Positions slots evenly on an ellipse inside a relative container. Null
// entries hold their position but render nothing (spacers).
function RingSlots({order, radiusX, radiusY, startAngle = 0, variant = "sm"}: {
	order: (SlotName | null)[];
	radiusX: number;
	radiusY: number;
	startAngle?: number;
	variant?: GearSlotButtonVariant
}) {
	return (
		<>
			{order.map((slotId, i) => {
				const angle = startAngle + (i / order.length) * 2 * Math.PI;
				const left  = 50 + radiusX * Math.sin(angle);
				const top   = 50 - radiusY * Math.cos(angle);

				return (
					<div
						key={slotId}
						className={"absolute -translate-x-1/2 -translate-y-1/2"}
						style={{left : `${left}%`, top : `${top}%`}}
					>
						<GearSlotButton slotId={slotId} size={variant} />
					</div>
				);
			})}
		</>
	);
}

function UnderRingRow({slots}: { slots: SlotName[] }) {
	return (
		<div className={"flex flex-row gap-2"}>
			{slots.map(slotId => {
				return <GearSlotButton key={slotId} slotId={slotId} size={"sm"} />;
			})}
		</div>
	);
}

const OUTER_RING: (SlotName | null)[] = [
	SlotName.SlotNameHelmet,
	null,
	SlotName.SlotNameArmor,
	SlotName.SlotNameRingI,
	SlotName.SlotNameRingII,
	SlotName.SlotNameArtifactI,
	SlotName.SlotNameGloves,
	SlotName.SlotNameNecklace,
	SlotName.SlotNameSubWeapon,
	SlotName.SlotNameAwakeningWeapon,
	SlotName.SlotNameMainWeapon,
	SlotName.SlotNameBelt,
	SlotName.SlotNameShoes,
	SlotName.SlotNameArtifactII,
	SlotName.SlotNameEarringII,
	SlotName.SlotNameEarringI,
];

// Inner appearance ring, mirroring the in-game window: each costume piece
// sits near its functional counterpart on the outer ring.
const INNER_RING = [
	SlotName.SlotNameCostumeArmor,
	SlotName.SlotNameCostumeGloves,
	SlotName.SlotNameCostumeSubWeapon,
	SlotName.SlotNameUnderwear,
	SlotName.SlotNameCostumeAwakeningWeapon,
	SlotName.SlotNameCostumeMainWeapon,
	SlotName.SlotNameCostumeShoes,
	SlotName.SlotNameCostumeHelmet,
];

// The in-game accessory bar below the equipment window: insignia/tome, the
// appearance accessories (head/ears, eye, face), then back and tool accessory.
const UNDER_RING = [
	SlotName.SlotNameTome,
	SlotName.SlotNameCostumeHeadpiece,
	SlotName.SlotNameCostumeEarring,
	SlotName.SlotNameCostumePiercing,
	SlotName.SlotNameGatheringCarrier,
	SlotName.SlotNameFishingChair
];

const SLOT_STEP = (2 * Math.PI) / OUTER_RING.length;

export function GearRing() {
	return (
		<div className={"flex flex-col items-center gap-3 w-full flex-1 min-h-0 relative"}>

			<div className={"relative flex-1 min-h-0 aspect-square max-w-full max-h-130"}>
				<div className={"absolute inset-[17.5%] rounded-full border border-surface-border"} />
				<div className={"absolute inset-[34%] rounded-full border border-surface-border"} />
				<div className={"absolute inset-[10%] bg-radial-[at_50%_50%] from-surface-3/30  to-transparent to-70%"} />

				<RingSlots order={OUTER_RING} radiusX={33} radiusY={33} startAngle={-SLOT_STEP} variant={"sm"} />
				<RingSlots order={INNER_RING} radiusX={15} radiusY={15} variant={"sm"} />

				{/* Alchemy stone stays dead-centre (matching the in-game window); everything else rings around it. */}
				<div className={"absolute inset-0 flex items-center justify-center pointer-events-none"}>
					<div className={"pointer-events-auto"}>
						<GearSlotButton slotId={SlotName.SlotNameAlchemyStone} size={"xs"} />
					</div>
				</div>
			</div>

			<UnderRingRow slots={UNDER_RING} />
		</div>
	);
}

// Life tool wheel, matching the in-game layout: axe upper-left, butcher knife
// upper-right, syringe/tanning knife on the sides, hoe/pickaxe at the bottom;
// fishing gear and the rest in a row below.
const LIFE_RING = [
	SlotName.SlotNameButcherKnife,
	SlotName.SlotNameTanningKnife,
	SlotName.SlotNamePickaxe,
	SlotName.SlotNameHoe,
	SlotName.SlotNameFluidCollector,
	SlotName.SlotNameLumberingAxe,
];

const LIFE_UNDER = [
	SlotName.SlotNameFishingRod,
	SlotName.SlotNameFishingFloat,
	SlotName.SlotNameFishingHarpoon
];

export function LifeRing() {
	return (
		<div className={"flex flex-col items-center gap-3 w-full"}>
			<div className={"relative w-full max-w-105 aspect-square"}>
				<div className={"absolute inset-[14%] rounded-full border border-zinc-800/80"} />
				<RingSlots order={LIFE_RING} radiusX={36} radiusY={38} startAngle={Math.PI / 6} />
			</div>

			<UnderRingRow slots={LIFE_UNDER} />
		</div>
	);
}
