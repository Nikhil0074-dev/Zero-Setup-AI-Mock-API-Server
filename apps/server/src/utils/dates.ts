export type Clock = () => Date;
export const systemClock: Clock = () => new Date();
export const addMinutes = (d: Date, minutes: number): Date => new Date(d.getTime() + minutes * 60_000);
