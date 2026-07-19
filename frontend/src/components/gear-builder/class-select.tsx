import {Button} from "@/components/ui/button.tsx";
import {gearBuilderStore} from "@/components/gear-builder/gear-builder-store.ts";
import {useSnapshot} from "valtio/react";

export function ClassSelect() {
	const {classes} = useSnapshot(gearBuilderStore);

	return (
		<div className={"flex flex-col items-center gap-6 p-8"}>
			<div className={"text-lg font-semibold"}>Choose a class</div>
			<div className={"grid grid-cols-4 gap-2 max-w-2xl"}>
				{classes.map(cls => (
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
