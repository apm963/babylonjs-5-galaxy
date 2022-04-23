
if (typeof setImmediate === 'undefined') {
    const setImmediate = (cb: Parameters<typeof setTimeout>[0]) => setTimeout(cb, 0);
    // @ts-ignore
    window.setImmediate = setImmediate;
}
