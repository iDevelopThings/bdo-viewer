import {Button} from "@/components/ui/button.tsx";
import {gearBuilderStore, useGearBuilderStore} from "@/components/gear-builder/gear-builder-store.ts";

export function ClassSelect() {
	const [builder] = useGearBuilderStore();

	return (
		<div className={"flex flex-col items-center gap-6 p-8"}>
			<div className={"text-lg font-semibold"}>Choose a class</div>
			<div className={"grid grid-cols-4 gap-2 max-w-2xl"}>
				{builder?.classes
					.map(cls => (
						<Button
							key={cls.Name}
							variant={"outline"}
							data-class-type={cls.CharacterClassType}
							size={"sm"}
							onClick={() => gearBuilderStore.selectClass(cls)}
						>
							{cls.Title}
						</Button>
					))}
			</div>
		</div>
	);
}
