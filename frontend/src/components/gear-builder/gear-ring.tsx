import {GEAR_SLOTS_BY_ID} from "@/state/gear/gear-slots.ts";
import {useGearBuild} from "@/state/gear/gear.tsx";
import {GearSlotButton} from "@/components/gear-builder/gear-slot-button.tsx";
import {Button} from "@/components/ui/button.tsx";

// Positions slots evenly on an ellipse inside a relative container. Null
// entries hold their position but render nothing (spacers).
function RingSlots({order, radiusX, radiusY, startAngle = 0}: {
	order: (string | null)[];
	radiusX: number;
	radiusY: number;
	startAngle?: number;
}) {
	return (
		<>
			{order.map((slotId, i) => {
				const def = slotId ? GEAR_SLOTS_BY_ID[slotId] : undefined;
				if (!def)
					return null;

				const angle = startAngle + (i / order.length) * 2 * Math.PI;
				const left  = 50 + radiusX * Math.sin(angle);
				const top   = 50 - radiusY * Math.cos(angle);

				return (
					<div
						key={slotId}
						className={"absolute -translate-x-1/2 -translate-y-1/2"}
						style={{left : `${left}%`, top : `${top}%`}}
					>
						<GearSlotButton def={def} size={"sm"} />
					</div>
				);
			})}
		</>
	);
}

function UnderRingRow({slots}: { slots: string[] }) {
	return (
		<div className={"flex flex-row gap-2"}>
			{slots.map(slotId => {
				const def = GEAR_SLOTS_BY_ID[slotId];
				return def ? <GearSlotButton key={slotId} def={def} size={"sm"} /> : null;
			})}
		</div>
	);
}

// Outer ring, clockwise: the 12 o'clock spot is an empty spacer (garmoth puts
// its lightstone pair there), keeping helmet and chest symmetric around the
// top. Rings/artifact/gloves/necklace run down the right, weapons along the
// bottom (main/awakening/sub reading left-to-right), then belt/boots/artifact/
// earrings back up the left.
const OUTER_RING: (string | null)[] = [
	"helmet",
	null,
	"armor",
	"ring1",
	"ring2",
	"artifact2",
	"gloves",
	"necklace",
	"subWeapon",
	"awakeningWeapon",
	"mainWeapon",
	"belt",
	"shoes",
	"artifact1",
	"earring2",
	"earring1",
];

// Inner appearance ring, mirroring the in-game window: each costume piece
// sits near its functional counterpart on the outer ring.
const INNER_RING = [
	"costumeArmor",
	"costumeGloves",
	"costumeSubWeapon",
	"underwear",
	"costumeAwakening",
	"costumeMainWeapon",
	"costumeShoes",
	"costumeHelmet",
];

// The in-game accessory bar below the equipment window: insignia/tome, the
// appearance accessories (head/ears, eye, face), then back and tool accessory.
const UNDER_RING = ["tome", "costumeHeadpiece", "costumeEarring", "costumePiercing", "gatheringCarrier", "fishingChair"];

const SLOT_STEP = (2 * Math.PI) / OUTER_RING.length;

export function GearRing() {
	const [store, snap] = useGearBuild();

	return (
		<div className={"flex flex-col items-center gap-3 w-full"}>
			<div className={"relative w-full max-w-[560px] aspect-square"}>
				<div className={"absolute inset-[12%] rounded-full border border-zinc-800/80"} />

				<RingSlots order={OUTER_RING} radiusX={42} radiusY={44} startAngle={-SLOT_STEP} />
				<RingSlots order={INNER_RING} radiusX={23} radiusY={24} />

				<div className={"absolute inset-0 flex flex-col items-center justify-center gap-1 pointer-events-none"}>
					<div className={"pointer-events-auto"}>
						{GEAR_SLOTS_BY_ID["alchemyStone"] && <GearSlotButton def={GEAR_SLOTS_BY_ID["alchemyStone"]} size={"sm"} />}
					</div>
					<span className={"text-base font-semibold text-zinc-200"}>{snap.characterClass}</span>
					<Button
						variant={"ghost"}
						size={"xs"}
						className={"pointer-events-auto text-zinc-400"}
						onClick={() => {
							store.characterClass = undefined;
						}}
					>
						Change Class
					</Button>
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
	"butcherKnife",
	"tanningKnife",
	"pickaxe",
	"hoe",
	"fluidCollector",
	"lumberingAxe",
];

const LIFE_UNDER = ["fishingRod", "fishingFloat", "fishingHarpoon"];

export function LifeRing() {
	return (
		<div className={"flex flex-col items-center gap-3 w-full"}>
			<div className={"relative w-full max-w-[420px] aspect-square"}>
				<div className={"absolute inset-[14%] rounded-full border border-zinc-800/80"} />
				<RingSlots order={LIFE_RING} radiusX={36} radiusY={38} startAngle={Math.PI / 6} />
			</div>

			<UnderRingRow slots={LIFE_UNDER} />
		</div>
	);
}
