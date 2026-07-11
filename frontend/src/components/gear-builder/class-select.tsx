import {CHARACTER_CLASSES} from "@/state/gear/gear-slots.ts";
import {useGearBuild} from "@/state/gear/gear.tsx";
import {Button} from "@/components/ui/button.tsx";

export function ClassSelect() {
	const [store] = useGearBuild();

	return (
		<div className={"flex flex-col items-center gap-6 p-8"}>
			<div className={"text-lg font-semibold"}>Choose a class</div>
			<div className={"grid grid-cols-4 gap-2 max-w-2xl"}>
				{CHARACTER_CLASSES.map(cls => (
					<Button
						key={cls}
						variant={"outline"}
						size={"sm"}
						onClick={() => store.setClass(cls)}
					>
						{cls}
					</Button>
				))}
			</div>
		</div>
	);
}
