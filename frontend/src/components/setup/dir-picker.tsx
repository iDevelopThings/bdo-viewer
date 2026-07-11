import {Input} from "@/components/ui/input.tsx";
import {Button} from "@/components/ui/button.tsx";
import {Label} from "@/components/ui/label.tsx";
import {PickDirectory} from "@bindings/bdo-viewer/internal/setup/service.ts";

// DirPicker is a text input for a directory path with a native Browse button.
export function DirPicker({label, value, onChange, title, placeholder, disabled}: {
	label: string;
	value: string;
	onChange: (v: string) => void;
	title: string;
	placeholder?: string;
	disabled?: boolean;
}) {
	const browse = async () => {
		const picked = await PickDirectory(title);
		if (picked) {
			onChange(picked);
		}
	};

	return (
		<div className={"flex flex-col gap-1.5"}>
			<Label className={"text-xs text-muted-foreground"}>{label}</Label>
			<div className={"flex items-center gap-2"}>
				<Input
					value={value}
					placeholder={placeholder}
					disabled={disabled}
					onChange={e => onChange(e.target.value)}
					className={"flex-1"}
				/>
				<Button size={"sm"} variant={"outline"} disabled={disabled} onClick={() => void browse()}>
					Browse…
				</Button>
			</div>
		</div>
	);
}
