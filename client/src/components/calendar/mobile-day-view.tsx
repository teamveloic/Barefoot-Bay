import React from 'react';
import { format } from 'date-fns';
import { type Event } from '@shared/schema';

interface MobileDayViewProps {
  date: Date;
  events: Event[];
}

/**
 * A dedicated component for rendering day cells in the mobile calendar view
 * This displays just the day number and a small indicator dot if the day has events
 */
export default function MobileDayView({ date, events }: MobileDayViewProps) {
  // Choose the primary color for the indicator dot based on the first event category
  const getCategoryColorHex = (category: string) => {
    switch (category) {
      case 'entertainment':
        return '#47759a';
      case 'government':
        return '#e9dfe0';
      case 'social':
        return '#efe59c';
      default:
        return '#CBD5E1'; // gray-300 equivalent
    }
  };

  return (
    <div className="h-full w-full flex flex-col relative" style={{ width: '100%', boxSizing: 'border-box' }}>
      {/* Day number - always show this */}
      <div className="text-right pr-1 font-semibold text-sm h-5">
        {format(date, "d")}
      </div>
      
      {/* Mobile indicator for events (dot only) */}
      {events.length > 0 && (
        <div className="absolute bottom-1 left-0 right-0 flex justify-center">
          <div 
            className="w-2.5 h-2.5 rounded-full" 
            style={{ 
              backgroundColor: events.length > 0 ? getCategoryColorHex(events[0].category) : 'transparent',
              opacity: 0.9
            }}
          />
        </div>
      )}
    </div>
  );
}