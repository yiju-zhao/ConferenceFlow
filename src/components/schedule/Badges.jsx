import React from "react";
import { VideoOff } from "lucide-react";

export const SessionTypeBadge = ({ type }) => (
  <span className="schedule-badge">{type}</span>
);

export const FormatBadge = ({ format }) => (
  <span className="schedule-badge">{format}</span>
);

export const NoRecordingBadge = () => (
  <span className="schedule-badge schedule-badge--warning">
    <VideoOff size={9} />
    No Rec
  </span>
);
