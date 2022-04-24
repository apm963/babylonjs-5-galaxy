
import * as Types from './Types';

function CreateRef() {
	
}

function CreateCanvas<T extends (Types.WhichControl<T[number]>[])>(content: T): T {
	return null as any;
}

/* function tester<T extends (Types.WhichControl<T[number]>[])>(value: T) {
	
} */

// Test

// tester([{type: Types.ControlType.Container, }, {type: Types.ControlType.Line, points: []}]);

const t = CreateCanvas([
	{
		type: Types.ControlType.Container,
		
	},
	{
		type: Types.ControlType.Line,
		points: [],
	},
]);

const first = t[0].type;
