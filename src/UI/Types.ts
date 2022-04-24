
export enum ControlType {
	Container,
	Rectangle,
	Text,
	Line,
}

module Base {
	export interface Control {
		readonly type: ControlType;
		
		readonly label?: string;
		readonly children?: Control[];
		readonly ref?: any;
	}
}

export type Control<T> = Container<T> | Rectangle<T> | Text<T> | Line<T>;

export interface Container<T> extends Base.Control {
	readonly type: ControlType.Container;
}

export interface Rectangle<T> extends Base.Control {
	readonly type: ControlType.Rectangle;
}

export interface Text<T> extends Base.Control {
	readonly type: ControlType.Text;
}

export interface Line<T> extends Base.Control {
	readonly type: ControlType.Line;
	readonly points: any[];
}

export type WhichControl<T> = (
	T extends { type: infer E } ? (
		E extends ControlType.Container ? Container<T> :
		E extends ControlType.Rectangle ? Rectangle<T> :
		E extends ControlType.Text ? Text<T> :
		E extends ControlType.Line ? Line<T> :
		Control<T>
	) : Control<T>
);
