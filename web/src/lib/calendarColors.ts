/** Google Calendar's event colours by colorId, as the planner stamps them on blocks (src/planner.cjs COLORS). */
export const CALENDAR_COLORS: Record<string, string> = {
  '1': '#7986cb', '2': '#33b679', '3': '#8e24aa', '4': '#e67c73', '5': '#f6bf26', '6': '#f4511e',
  '7': '#039be5', '8': '#616161', '9': '#3f51b5', '10': '#0b8043', '11': '#d50000',
};
export const COLOR_IDS = Object.keys(CALENDAR_COLORS);
