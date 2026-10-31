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
    doShowMoreDrillDown?: boolean;
    selectable?: boolean | "ignoreEvents";
    longPressThreshold?: number;
    scrollToTime?: Date;
    messages?: {
      today?: string;
      previous?: string;
      next?: string;
      month?: string;
      week?: string;
      day?: string;
      agenda?: string;
      date?: string;
      time?: string;
      event?: string;
      allDay?: string;
      noEventsInRange?: string;
      showMore?: (total: number) => string;
    };
    formats?: {
      monthHeaderFormat?: string;
      dayHeaderFormat?: string;
      dayRangeHeaderFormat?: ({ start, end }: { start: Date; end: Date }) => string;
      weekdayFormat?: string;
      dateFormat?: string;
      dayFormat?: string;
      agendaDateFormat?: string;
      agendaHeaderFormat?: ({ start, end }: { start: Date; end: Date }) => string;
    };
    dayPropGetter?: (date: Date) => {
      className?: string;
      style?: React.CSSProperties;
    };
    eventPropGetter?: (event: TEvent) => {
      className?: string;
      style?: React.CSSProperties;
    };
    components?: {
      dateCellWrapper?: React.ComponentType<{ value: Date; range?: Date[]; children?: React.ReactNode }>;
      toolbar?: React.ComponentType<{
        label: string;
        date: Date;
        view: View;
        views: View[];
        onNavigate: (action: "PREV" | "NEXT" | "TODAY" | "DATE", newDate?: Date) => void;
        onView: (view: View) => void;
      }>;
      month?: {
        dateHeader?: React.ComponentType<{
          date: Date;
          label: string;
        }>;
        event?: React.ComponentType<{ event: TEvent; title: string }>;
      };
      week?: { event?: React.ComponentType<{ event: TEvent; title: string }> };
      day?: { event?: React.ComponentType<{ event: TEvent; title: string }> };
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

declare module "react-big-calendar/lib/addons/dragAndDrop" {
  import * as React from "react";
  import type { CalendarProps, Event } from "react-big-calendar";

  export type EventInteractionArgs<TEvent> = {
    event: TEvent;
    start: Date | string;
    end: Date | string;
    isAllDay?: boolean;
  };

  export type DragAndDropProps<TEvent> = {
    onEventDrop?: (args: EventInteractionArgs<TEvent>) => void;
    onEventResize?: (args: EventInteractionArgs<TEvent>) => void;
    draggableAccessor?: ((event: TEvent) => boolean) | keyof TEvent;
    resizableAccessor?: ((event: TEvent) => boolean) | keyof TEvent;
    resizable?: boolean;
  };

  export default function withDragAndDrop<TEvent extends object = Event>(
    calendar: React.ComponentType<CalendarProps<TEvent>>,
  ): React.ComponentType<CalendarProps<TEvent> & DragAndDropProps<TEvent>>;
}

declare module "react-big-calendar/lib/addons/dragAndDrop/styles.css";
