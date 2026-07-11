import {Item} from "@bindings/github.com/idevelopthings/bdo-data-extractor/src/model";

export type DeepReadonly<T> = T extends (infer U)[]
	? readonly DeepReadonly<U>[]
	: T extends object
		? { readonly [K in keyof T]: DeepReadonly<T[K]> }
		: T;

export type MaybeReadonly<T> = T | DeepReadonly<T>;
/*
var gradeColors = map[string]color.Color{
	"white":  color.RGBA{0xe8, 0xea, 0xed, 0xff},
	"green":  color.RGBA{0x7d, 0xc8, 0x6e, 0xff},
	"blue":   color.RGBA{0x5b, 0x9d, 0xff, 0xff},
	"yellow": color.RGBA{0xe6, 0xc8, 0x4e, 0xff},
	"orange": color.RGBA{0xe0, 0x8a, 0x3c, 0xff},
}*/

export const grades = {
	"white"  : {
		color : "#e8eaed",
	},
	"green"  : {
		color : "#7dc86e",
	},
	"blue"   : {
		color : "#5b9dff",
	},
	"yellow" : {
		color : "#e6c84e",
	},
	"orange" : {
		color : "#e08a3c",
	}
};
export type Grade = keyof typeof grades;
