
enum ControlType {
	Container,
	Rectangle,
	Text,
	Line,
}

module Base {
	export interface Control {
		type: ControlType;
		
		label?: string;
		children?: Control[];
		ref?: any;
	}
}

export type Control<T> = Container<T> | Rectangle<T> | Text<T> | Line<T>;

export interface Container<T> extends Base.Control {
	type: ControlType.Container;
}

export interface Rectangle<T> extends Base.Control {
	type: ControlType.Rectangle;
}

export interface Text<T> extends Base.Control {
	type: ControlType.Text;
}

export interface Line<T> extends Base.Control {
	type: ControlType.Line;
	points: any[];
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
