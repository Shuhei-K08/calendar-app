declare module "react-big-calendar" {
  import * as React from "react";

  export type Event = {
    title?: React.ReactNode;
    start?: Date;
    end?: Date;
    allDay?: boolean;
    resource?: unknown;
  };

  export type DateLocalizer = unknown;
  export type View = "month" | "week" | "work_week" | "day" | "agenda";

  export function dateFnsLocalizer(config: {
    format: (...args: never[]) => string;
    parse: (...args: never[]) => Date;
    startOfWeek: (...args: never[]) => Date;
    getDay: (...args: never[]) => number;
    locales: Record<string, unknown>;
  }): DateLocalizer;

  export type CalendarProps<TEvent extends object = Event> = {
    localizer: DateLocalizer;
    events: TEvent[];
    startAccessor: keyof TEvent | ((event: TEvent) => Date);
    endAccessor: keyof TEvent | ((event: TEvent) => Date);
    allDayAccessor?: keyof TEvent | ((event: TEvent) => boolean);
    culture?: string;
    date?: Date;
    view?: View;
    dayLayoutAlgorithm?: "overlap" | "no-overlap";
    popup?: boolean;
    selectable?: boolean;
    longPressThreshold?: number;
    messages?: {
      today?: string;
      previous?: string;
      next?: string;
      month?: string;
      week?: string;
      day?: string;
      agenda?: string;
      showMore?: (total: number) => string;
    };
    eventPropGetter?: (event: TEvent) => {
      className?: string;
      style?: React.CSSProperties;
    };
    onNavigate?: (date: Date) => void;
    onView?: (view: View) => void;
    onDrillDown?: (date: Date) => void;
    onShowMore?: (events: TEvent[], date: Date) => void;
    onSelectSlot?: (slotInfo: {
      start: Date;
      end: Date;
      slots?: Date[];
      action?: "select" | "click" | "doubleClick";
    }) => void;
    onSelectEvent?: (event: TEvent) => void;
  };

  export class Calendar<
    TEvent extends object = Event,
  > extends React.Component<CalendarProps<TEvent>> {}
}
