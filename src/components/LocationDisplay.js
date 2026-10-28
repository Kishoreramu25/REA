import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Navigation, Gauge, Clock } from 'lucide-react-native';
import { COLORS } from '../utils/constants';
import { 
  getBusStatus, 
  isBusLate, 
  formatLastSeen, 
  BUS_STATUS, 
  parseTimeToToday 
} from '../utils/helpers';

export default function LocationDisplay({ 
  bus,
  isTracking, 
  location, 
  busName, 
  origin,
  endPlace = 'ESEC Campus',
  startTime = '',
  collegeTime = '',
  stops = []
}) {
  // Real-time clock updating every second
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const busObj = {
    ...(bus || {}),
    is_tracking: isTracking !== undefined ? Boolean(isTracking) : Boolean(bus?.is_tracking || bus?.isTracking),
    isTracking: isTracking !== undefined ? Boolean(isTracking) : Boolean(bus?.is_tracking || bus?.isTracking),
    start_time: bus?.start_time || bus?.startTime || startTime,
    startTime: bus?.startTime || bus?.start_time || startTime,
    end_time: bus?.end_time || bus?.collegeTime || collegeTime,
    collegeTime: bus?.collegeTime || bus?.end_time || collegeTime,
    start_place: bus?.start_place || bus?.origin || origin,
    origin: bus?.origin || bus?.start_place || origin,
    end_place: bus?.end_place || bus?.endPlace || endPlace,
    endPlace: bus?.endPlace || bus?.end_place || endPlace
  };

  const status = getBusStatus(busObj, location, time);
  const busStartTime = bus?.startTime || bus?.start_time || startTime;
  const busEndTime = bus?.collegeTime || bus?.end_time || collegeTime;
  const busOrigin = bus?.origin || bus?.start_place || origin;
  const busDest = bus?.endPlace || bus?.end_place || endPlace;
  const displayName = bus?.name || busName || `Bus No ${bus?.bus_number || ''}`;

  // Requirement 4: Hide saved coordinates for NOT_STARTED and ENDED
  const hideCoords = status === BUS_STATUS.NOT_STARTED || status === BUS_STATUS.ENDED;
  const hasLiveCoords = !hideCoords && Boolean(location?.latitude && location?.longitude);

  // Status configuration
  let chipText = 'IDLE';
  let chipStyle = styles.chipIdle;
  let chipTextStyle = styles.chipIdleText;
  let dotStyle = styles.dotIdle;
  let cardStyle = styles.cardIdle;
  let subtext = `Scheduled departure from ${busOrigin || 'origin'}`;

  // Lateness badge and status banner
  let latenessBadge = 'ON TIME';
  let badgeColor = '#16a34a';
  let badgeBg = '#dcfce7';
  let statusDetail = 'Operating according to scheduled timetable';

  const startDate = parseTimeToToday(busStartTime, time);

  if (status === BUS_STATUS.LIVE) {
    cardStyle = styles.cardLive;
    dotStyle = styles.dotLive;
    chipStyle = styles.chipLive;
    chipTextStyle = styles.chipLiveText;
    chipText = 'LIVE GPS';
    subtext = 'Broadcasting live GPS to students & parents';
    latenessBadge = 'LIVE';
    badgeColor = '#0284c7';
    badgeBg = '#e0f2fe';
    statusDetail = `En route to ${busDest} • Scheduled arrival ${busEndTime}`;
  } else if (status === BUS_STATUS.SIGNAL_LOST) {
    cardStyle = styles.cardIdle;
    dotStyle = { backgroundColor: '#f59e0b' };
    chipStyle = { backgroundColor: '#fef3c7', borderColor: '#fde68a' };
    chipTextStyle = { color: '#b45309' };
    chipText = 'SIGNAL LOST';
    const lastSeenText = formatLastSeen(location?.updated_at);
    subtext = `${lastSeenText} • Awaiting reconnect`;
    latenessBadge = 'SIGNAL LOST';
    badgeColor = '#d97706';
    badgeBg = '#fef3c7';
    statusDetail = `${lastSeenText} (Trip active, GPS signal temporarily unavailable)`;
  } else if (status === BUS_STATUS.ENDED) {
    cardStyle = styles.cardIdle;
    dotStyle = styles.dotIdle;
    chipStyle = styles.chipIdle;
    chipTextStyle = styles.chipIdleText;
    chipText = 'ENDED';
    subtext = `Trip completed at ${busDest}`;
    latenessBadge = 'TRIP ENDED';
    badgeColor = '#64748b';
    badgeBg = '#f1f5f9';
    statusDetail = `Scheduled arrival was ${busEndTime}`;
  } else {
    // NOT_STARTED
    cardStyle = styles.cardIdle;
    dotStyle = styles.dotIdle;
    chipStyle = styles.chipIdle;
    chipTextStyle = styles.chipIdleText;
    chipText = 'NOT STARTED';
    subtext = `Scheduled departure from ${busOrigin || 'origin'}`;

    // Requirement 4: Show LATE only when not started and now is between start+3 min and arrival time.
    if (isBusLate(busObj, time) && startDate) {
      const diffStartMins = Math.floor((time.getTime() - startDate.getTime()) / 60000);
      latenessBadge = `${diffStartMins}m LATE`;
      badgeColor = '#dc2626';
      badgeBg = '#fee2e2';
      statusDetail = `Trip departure delayed by ${diffStartMins} mins (Trip not started)`;
    } else if (startDate && time.getTime() < startDate.getTime()) {
      const waitMins = Math.max(1, Math.floor((startDate.getTime() - time.getTime()) / 60000));
      latenessBadge = 'SCHEDULED';
      badgeColor = '#16a34a';
      badgeBg = '#dcfce7';
      statusDetail = `Departs from ${busOrigin || 'terminal'} in ${waitMins} min`;
    } else {
      latenessBadge = 'BOARDING';
      badgeColor = '#ea580c';
      badgeBg = '#ffedd5';
      statusDetail = `Scheduled departure at ${busStartTime}`;
    }
  }

  return (
    <View style={[styles.card, cardStyle]}>
      {/* Header: Bus Name & Live Status Chip */}
      <View style={styles.topRow}>
        <View style={styles.leftCol}>
          <View style={styles.statusIndicator}>
            <View style={[styles.pulseDot, dotStyle]} />
            <Text style={styles.titleText}>
              {displayName}
            </Text>
          </View>
          <Text style={styles.subtext}>
            {subtext}
          </Text>
        </View>

        <View style={[styles.chip, chipStyle]}>
          <Text style={[styles.chipText, chipTextStyle]}>
            {chipText}
          </Text>
        </View>
      </View>

      {/* 3-Column Time Bar: Arrival | Current Live Time | Departure */}
      <View style={styles.timeBarRow}>
        {/* Left: Arrival Time */}
        <View style={styles.timeBarColLeft}>
          <Text style={styles.timeBarLabel}>ARRIVAL</Text>
          <Text style={styles.timeBarValue}>{busEndTime || '--:--'}</Text>
          <Text style={styles.timeBarSub} numberOfLines={1}>{busDest || 'ESEC Campus'}</Text>
        </View>

        {/* Divider */}
        <View style={styles.timeBarDivider} />

        {/* Center: Current Live Time */}
        <View style={styles.timeBarColCenter}>
          <View style={styles.liveClockHeader}>
            <Clock size={12} color="#162a6b" />
            <Text style={styles.liveClockLabel}>CURRENT TIME</Text>
          </View>
          <Text style={styles.liveClockValue}>{time.toLocaleTimeString()}</Text>
          <View style={[styles.miniBadge, { backgroundColor: badgeBg, borderColor: badgeColor }]}>
            <Text style={[styles.miniBadgeText, { color: badgeColor }]}>{latenessBadge}</Text>
          </View>
        </View>

        {/* Divider */}
        <View style={styles.timeBarDivider} />

        {/* Right: Departure Time */}
        <View style={styles.timeBarColRight}>
          <Text style={[styles.timeBarLabel, styles.alignRight]}>DEPARTURE</Text>
          <Text style={[styles.timeBarValue, styles.alignRight]}>{busStartTime || '--:--'}</Text>
          <Text style={[styles.timeBarSub, styles.alignRight]} numberOfLines={1}>{busOrigin || 'Origin'}</Text>
        </View>
      </View>

      {/* Lateness Notice Banner */}
      <View style={[styles.statusBanner, { backgroundColor: badgeBg, borderColor: badgeColor }]}>
        <Text style={[styles.statusBannerText, { color: badgeColor }]}>
          {statusDetail}
        </Text>
      </View>

      {/* Real-time Coordinates & Speed */}
      {hasLiveCoords ? (
        <View style={styles.coordsRow}>
          <View style={styles.coordItem}>
            <Navigation size={12} color={COLORS.accent} />
            <Text style={styles.coordText}>
              Lat: {Number(location.latitude).toFixed(5)}, Lng: {Number(location.longitude).toFixed(5)}
            </Text>
          </View>

          {location.speed !== undefined && location.speed !== null ? (
            <View style={styles.coordItem}>
              <Gauge size={12} color={COLORS.accent} />
              <Text style={styles.coordText}>
                {Math.round(Math.max(0, location.speed) * 3.6)} km/h
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    padding: 14,
    marginBottom: 12
  },
  cardLive: {
    borderColor: '#bae6fd',
    backgroundColor: '#f0f9ff'
  },
  cardIdle: {
    borderColor: COLORS.border,
    backgroundColor: '#ffffff'
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },
  leftCol: {
    flex: 1
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2
  },
  pulseDot: {
    width: 10,
    height: 10,
    borderRadius: 5
  },
  dotLive: {
    backgroundColor: COLORS.success
  },
  dotIdle: {
    backgroundColor: COLORS.textSecondary
  },
  titleText: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text
  },
  subtext: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderRadius: 4
  },
  chipLive: {
    backgroundColor: COLORS.successLight,
    borderColor: '#86efac'
  },
  chipIdle: {
    backgroundColor: '#f1f5f9',
    borderColor: COLORS.borderDark
  },
  chipText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5
  },
  chipLiveText: {
    color: '#15803d'
  },
  chipIdleText: {
    color: '#64748b'
  },
  timeBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 10,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1
  },
  timeBarColLeft: {
    flex: 1.1,
    alignItems: 'flex-start'
  },
  timeBarColCenter: {
    flex: 1.4,
    alignItems: 'center',
    justifyContent: 'center'
  },
  timeBarColRight: {
    flex: 1.1,
    alignItems: 'flex-end'
  },
  timeBarDivider: {
    width: 1,
    height: 38,
    backgroundColor: '#e2e8f0',
    marginHorizontal: 4
  },
  timeBarLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  timeBarValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0f172a',
    marginTop: 2
  },
  timeBarSub: {
    fontSize: 10.5,
    color: '#64748b',
    marginTop: 1
  },
  alignRight: {
    textAlign: 'right'
  },
  liveClockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  liveClockLabel: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#162a6b',
    letterSpacing: 0.4
  },
  liveClockValue: {
    fontSize: 13,
    fontWeight: '900',
    color: '#162a6b',
    letterSpacing: 0.5,
    marginVertical: 1
  },
  miniBadge: {
    borderWidth: 1,
    borderRadius: 3,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    marginTop: 1
  },
  miniBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4
  },
  statusBanner: {
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 6
  },
  statusBannerText: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center'
  },
  coordsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e0f2fe'
  },
  coordItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4
  },
  coordText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.accent
  }
});
