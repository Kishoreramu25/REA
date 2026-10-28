import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Animated, Easing } from 'react-native';
import { Star } from 'lucide-react-native';
import { COLORS } from '../utils/constants';
import { getBusStatus, BUS_STATUS, getRouteProgress, isBusLate } from '../utils/helpers';

/**
 * Format minutes from midnight to 12-hour 'hh:mm AM/PM' string
 */
function formatMinutesToTime12(totalMinutes) {
  if (totalMinutes == null || isNaN(totalMinutes)) return '';
  let m = Math.round(totalMinutes) % 1440;
  if (m < 0) m += 1440;
  let h = Math.floor(m / 60);
  const mins = m % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const hPad = h < 10 ? `0${h}` : `${h}`;
  const mPad = mins < 10 ? `0${mins}` : `${mins}`;
  return `${hPad}:${mPad} ${period}`;
}

export const BUS_STATUS_HEADER_HEIGHT = 36;

export default function BusStatus({ 
  bus, 
  location, 
  status: propStatus, 
  progress: propProgress, 
  now: propNow,
  myStopName = null,
  onToggleMyStop,
  onRowLayoutsChange
}) {
  const now = propNow instanceof Date ? propNow : new Date(propNow || Date.now());
  const status = propStatus || (bus ? getBusStatus(bus, location, now) : BUS_STATUS.NOT_STARTED);
  const progress = propProgress || (bus ? getRouteProgress(bus, location, now, 0) : { ready: false });

  // Dynamic stops from bus
  const stops = bus ? [
    { 
      name: bus.origin || bus.start_place || 'Start Place', 
      time: bus.startTime || bus.start_time || '', 
      isOrigin: true 
    },
    ...(bus.via || bus.stops || []).map((s, idx) => ({
      name: typeof s === 'object' ? (s.name || s.stop_name || '') : String(s),
      time: typeof s === 'object' ? (s.time || s.stop_time || '') : '',
      stopIndex: idx + 1
    })),
    { 
      name: bus.endPlace || bus.end_place || 'ESEC Campus', 
      time: bus.collegeTime || bus.end_time || '', 
      isTerminal: true 
    }
  ] : [];

  // Determine active stop index for bus marker badge
  let activeStopIdx = 0;
  const isLive = status === BUS_STATUS.LIVE;
  const isSignalLost = status === BUS_STATUS.SIGNAL_LOST;

  if (isLive && progress.ready) {
    if (progress.phase === 'at_start' || progress.phase === 'before_start') {
      activeStopIdx = 0;
    } else if (progress.phase === 'arrived') {
      activeStopIdx = stops.length > 0 ? stops.length - 1 : 0;
    } else {
      activeStopIdx = Math.min(progress.nextIdx, Math.max(0, stops.length - 1));
    }
  } else if (isSignalLost && progress.ready) {
    activeStopIdx = Math.min(progress.nextIdx, Math.max(0, stops.length - 1));
  } else if (status === BUS_STATUS.ENDED) {
    activeStopIdx = stops.length > 0 ? stops.length - 1 : 0;
  } else {
    // NOT_STARTED or scheduled: bus is standing at the origin
    activeStopIdx = 0;
  }

  // Track measured layouts for continuous bus positioning along the path line
  const [rowLayouts, setRowLayouts] = useState({});
  const busAnimY = useRef(new Animated.Value(0)).current;
  const hasPlacedFirstLivePosRef = useRef(false);
  const lastGoodTargetTopRef = useRef(null);
  const lastUpdateTsRef = useRef(Date.now());
  const lastAnimatedTargetRef = useRef(null);
  const runningAnimRef = useRef(null);

  // In-app debug telemetry log (target vs time)
  const [debugLogs, setDebugLogs] = useState([]);
  const [showDebugLogs, setShowDebugLogs] = useState(false);

  // Report rowLayouts to parent via useEffect
  useEffect(() => {
    if (onRowLayoutsChange) {
      onRowLayoutsChange(rowLayouts);
    }
  }, [rowLayouts, onRowLayoutsChange]);

  // Helper to get centerY for stop i (row minHeight is 88)
  const getStopCenterY = (i) => {
    if (rowLayouts[i]?.centerY != null) {
      return rowLayouts[i].centerY;
    }
    const defaultRowHeight = 88;
    return i * defaultRowHeight + defaultRowHeight / 2;
  };

  // Requirement 7: A 1.5 km GPS spike must not move the icon (ignore an off_route point for placement and keep last good position)
  const isOffRouteSpike = progress.phase === 'off_route';
  let targetCenterY;

  if (isOffRouteSpike) {
    // 1.5 km spike / off-route: hold the last verified good position
    if (lastGoodTargetTopRef.current != null) {
      targetCenterY = lastGoodTargetTopRef.current + 17.5;
    } else {
      targetCenterY = getStopCenterY(0);
    }
  } else if (status === BUS_STATUS.NOT_STARTED) {
    targetCenterY = getStopCenterY(0);
    lastGoodTargetTopRef.current = targetCenterY - 17.5;
  } else if (status === BUS_STATUS.ENDED) {
    targetCenterY = getStopCenterY(Math.max(0, stops.length - 1));
    lastGoodTargetTopRef.current = targetCenterY - 17.5;
  } else if ((isLive || isSignalLost) && progress.ready) {
    if (progress.phase === 'before_start') {
      targetCenterY = getStopCenterY(0);
    } else {
      // at_start, en_route, arrived: continuous movement between stops based on segIdx and t
      const segIdx = Math.max(0, Math.min(progress.segIdx ?? 0, Math.max(0, stops.length - 2)));
      const t = Math.max(0, Math.min(1, progress.t ?? 0));
      const startY = getStopCenterY(segIdx);
      const endY = getStopCenterY(segIdx + 1);
      targetCenterY = startY + t * (endY - startY);
    }
    lastGoodTargetTopRef.current = targetCenterY - 17.5;
  } else {
    targetCenterY = getStopCenterY(activeStopIdx);
    lastGoodTargetTopRef.current = targetCenterY - 17.5;
  }

  const targetTop = targetCenterY - 17.5; // Half of bus height (35 / 2 = 17.5)

  // Continuous Glide without step-wait-step: smoothly glide to new target using native driver
  useEffect(() => {
    if (!progress.ready) {
      busAnimY.setValue(targetTop);
      lastAnimatedTargetRef.current = targetTop;
      return;
    }

    const nowTs = Date.now();
    const elapsedSinceLastUpdate = nowTs - lastUpdateTsRef.current;
    lastUpdateTsRef.current = nowTs;

    // Record in-app debug log: target vs time
    const timeStr = new Date(nowTs).toTimeString().split(' ')[0] + '.' + String(nowTs % 1000).padStart(3, '0');
    const logItem = {
      id: `${nowTs}_${Math.random().toString(36).slice(2, 6)}`,
      time: timeStr,
      targetTop: Math.round(targetTop * 10) / 10,
      phase: progress.phase || 'unknown',
      segIdx: progress.segIdx ?? 0,
      t: Math.round((progress.t || 0) * 100) / 100,
      ignored: isOffRouteSpike,
      lat: location?.latitude ? parseFloat(location.latitude).toFixed(4) : '--',
      lng: location?.longitude ? parseFloat(location.longitude).toFixed(4) : '--'
    };

    setDebugLogs((prev) => [logItem, ...prev.slice(0, 39)]);

    if (!hasPlacedFirstLivePosRef.current) {
      busAnimY.setValue(targetTop);
      hasPlacedFirstLivePosRef.current = true;
      lastAnimatedTargetRef.current = targetTop;
    } else if (!isOffRouteSpike) {
      const diff = Math.abs(targetTop - (lastAnimatedTargetRef.current ?? targetTop));
      if (diff > 0.5) {
        lastAnimatedTargetRef.current = targetTop;

        // Dynamic glide cadence: match actual update interval to eliminate step-wait-step pauses
        const glideDuration = Math.max(2500, Math.min(12000, elapsedSinceLastUpdate > 500 && elapsedSinceLastUpdate < 20000 ? elapsedSinceLastUpdate : 10000));

        if (runningAnimRef.current) {
          runningAnimRef.current.stop();
        }

        runningAnimRef.current = Animated.timing(busAnimY, {
          toValue: targetTop,
          duration: glideDuration,
          easing: Easing.linear,
          useNativeDriver: true,
        });

        runningAnimRef.current.start(() => {
          runningAnimRef.current = null;
        });
      }
    }
  }, [targetTop, progress.ready, progress.phase]);

  // Safe check after all hooks
  if (!bus) return null;

  // Check delay threshold: abs(delayMin) >= 3
  const hasSignificantDelay = (isLive || isSignalLost) && progress.ready && Math.abs(progress.delayMin) >= 3;
  const isLate = progress.delayMin >= 3;
  const delayColor = isLate ? '#dc2626' : '#16a34a';

  // Clean date string: e.g. "Thu, 22 Oct"
  const dayName = now.toLocaleDateString('en-US', { weekday: 'short' });
  const dayNum = now.getDate();
  const monthName = now.toLocaleDateString('en-US', { month: 'short' });
  const cleanDateStr = `${dayName}, ${dayNum} ${monthName}`;

  const formatStopName = (str) => {
    if (!str) return '';
    const trimmed = str.trim();
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  };

  return (
    <View style={styles.container}>
      {/* 1. Header Bar: Minimal light header (Arrival | Date | Departure) */}
      <View style={styles.headerBar}>
        <Text style={styles.headerColLeft}>Arrival</Text>
        <Text style={styles.headerColCenter}>{cleanDateStr}</Text>
        <Text style={styles.headerColRight}>Departure</Text>
      </View>

      {/* 2. Route List Container: Full straight continuous path line */}
      <View style={styles.stopsList}>
        {stops.map((stop, idx) => {
          const isFirst = idx === 0;
          const isLast = idx === stops.length - 1;
          const isCurrent = idx === activeStopIdx;
          const isCompleted = activeStopIdx >= 0 ? idx < activeStopIdx : (status === BUS_STATUS.ENDED);

          const isMyStop = !isLast && myStopName && (
            stop.name.trim().toLowerCase() === myStopName.trim().toLowerCase()
          );

          const fixedTime = stop.time || '';
          
          // Predicted time
          let predictedTimeStr = '';
          if (progress.ready && Array.isArray(progress.predicted) && progress.predicted[idx] != null) {
            predictedTimeStr = formatMinutesToTime12(progress.predicted[idx]);
          }

          // Subtitle for each stop
          let metaSubtitle = '';
          if (isLive && progress.ready) {
            if (progress.phase === 'at_start') {
              metaSubtitle = isFirst ? 'At start' : `ETA ${predictedTimeStr || fixedTime}`;
            } else if (progress.phase === 'before_start') {
              metaSubtitle = isFirst ? `Starts in ${progress.etaNextMin} mins` : 'Scheduled';
            } else if (progress.phase === 'arrived') {
              metaSubtitle = isLast ? 'Reached' : 'Passed';
            } else if (progress.phase === 'off_route') {
              metaSubtitle = 'Off route';
            } else {
              // en_route
              if (idx < progress.nextIdx) {
                metaSubtitle = 'Passed';
              } else if (idx === progress.nextIdx) {
                metaSubtitle = progress.etaNextMin === 0 ? 'Arriving now' : `In ${progress.etaNextMin} mins`;
              } else {
                metaSubtitle = `ETA ${predictedTimeStr || fixedTime}`;
              }
            }
          } else if (isSignalLost && progress.ready) {
            if (idx < progress.nextIdx) {
              metaSubtitle = 'Passed';
            } else if (idx === progress.nextIdx) {
              metaSubtitle = 'Heading here';
            } else {
              metaSubtitle = `ETA ${predictedTimeStr || fixedTime}`;
            }
          } else if (status === BUS_STATUS.NOT_STARTED) {
            if (isBusLate(bus, now)) {
              metaSubtitle = isFirst ? 'Late departure' : 'Scheduled';
            } else {
              metaSubtitle = isFirst ? 'Origin' : isLast ? 'Campus' : 'Scheduled';
            }
          } else if (status === BUS_STATUS.ENDED) {
            metaSubtitle = 'Trip ended';
          }

          // Show struck-through time if |delayMin| >= 3 for upcoming/active stops
          const showDelayTimes = hasSignificantDelay && !isCompleted && predictedTimeStr && predictedTimeStr !== fixedTime;

          return (
            <View 
              key={idx} 
              style={[styles.stopRow, isMyStop && styles.myStopRow]}
              onLayout={(e) => {
                const { y, height } = e.nativeEvent.layout;
                setRowLayouts((prev) => {
                  if (prev[idx]?.y === y && prev[idx]?.height === height) return prev;
                  return { ...prev, [idx]: { y, height, centerY: y + height / 2 } };
                });
              }}
            >
              {/* Column 1 (Left): Arrival Time */}
              <View style={styles.arrivalCol}>
                {isFirst ? (
                  <View style={styles.timeStack}>
                    <Text style={styles.fixedTimeText}>Start</Text>
                    <Text style={styles.placeholderDash}>--</Text>
                  </View>
                ) : showDelayTimes ? (
                  <View style={styles.timeStack}>
                    <Text style={[styles.fixedTimeText, { textDecorationLine: 'line-through', textDecorationColor: delayColor }]}>
                      {fixedTime}
                    </Text>
                    <Text style={[styles.delayedTimeText, { color: delayColor }]}>
                      {predictedTimeStr}
                    </Text>
                  </View>
                ) : (
                  <Text style={[
                    styles.singleTimeText, 
                    isCompleted && styles.pastTimeText
                  ]}>
                    {fixedTime || '--:--'}
                  </Text>
                )}
              </View>

              {/* Column 2: Continuous Straight Path Line with Circles */}
              <View style={styles.trackCol}>
                <View
                  style={[
                    styles.continuousLine,
                    isFirst && styles.continuousLineFirst,
                    isLast && styles.continuousLineLast,
                    !isFirst && !isLast && styles.continuousLineMiddle
                  ]}
                />
                <View style={[styles.nodeCircle, isCompleted && styles.completedNodeCircle]} />
              </View>

              {/* Column 3: Stop Name & Details */}
              <View style={styles.infoCol}>
                <View style={styles.stopNameRow}>
                  <Text
                    style={[
                      styles.stopNameText,
                      isCompleted && styles.pastStopText,
                      isMyStop && styles.myStopNameText
                    ]}
                    numberOfLines={2}
                  >
                    {formatStopName(stop.name)}
                  </Text>

                  {/* Star button on each row except the end stop */}
                  {!isLast && (
                    <TouchableOpacity 
                      style={styles.starBtn}
                      onPress={() => onToggleMyStop && onToggleMyStop(stop)}
                      activeOpacity={0.7}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Star 
                        size={16} 
                        color={isMyStop ? '#f59e0b' : '#94a3b8'} 
                        fill={isMyStop ? '#f59e0b' : 'transparent'} 
                        strokeWidth={2}
                      />
                    </TouchableOpacity>
                  )}

                  {isMyStop && (
                    <View style={styles.myStopTag}>
                      <Text style={styles.myStopTagText}>MY STOP</Text>
                    </View>
                  )}
                </View>

                <View style={styles.stopMetaRow}>
                  <Text style={[
                    styles.metaSub, 
                    isCompleted && styles.pastMetaText,
                    isCurrent && (isSignalLost ? styles.signalLostMetaText : styles.currentMetaText)
                  ]}>
                    {metaSubtitle}
                  </Text>
                </View>
              </View>

              {/* Column 4 (Right): Departure Time */}
              <View style={styles.departureCol}>
                {isLast ? (
                  <View style={styles.timeStackRight}>
                    <Text style={styles.fixedTimeTextRight}>End</Text>
                    <Text style={styles.placeholderDashRight}>--</Text>
                  </View>
                ) : showDelayTimes ? (
                  <View style={styles.timeStackRight}>
                    <Text style={[styles.fixedTimeTextRight, { textDecorationLine: 'line-through', textDecorationColor: delayColor }]}>
                      {fixedTime}
                    </Text>
                    <Text style={[styles.delayedTimeTextRight, { color: delayColor }]}>
                      {predictedTimeStr}
                    </Text>
                  </View>
                ) : (
                  <Text style={[
                    styles.singleTimeTextRight, 
                    isCompleted && styles.pastTimeText
                  ]}>
                    {fixedTime || '--:--'}
                  </Text>
                )}
              </View>
            </View>
          );
        })}

        {/* Continuous Floating Bus Cutout along the route path (only for LIVE and SIGNAL_LOST when progress.ready) */}
        {(isLive || isSignalLost) && progress.ready && (
          <Animated.View 
            pointerEvents="none"
            style={[
              styles.continuousBusOverlay,
              { transform: [{ translateY: busAnimY }] }
            ]}
          >
            <Image 
              source={require('../../assets/bus_hero.png')} 
              style={styles.heroBusImage} 
              resizeMode="contain" 
            />
          </Animated.View>
        )}
      </View>

      {/* In-App Debug Telemetry Log: Icon Target vs Time */}
      <View style={styles.debugSection}>
        <TouchableOpacity 
          style={styles.debugToggleBtn} 
          onPress={() => setShowDebugLogs((v) => !v)}
          activeOpacity={0.8}
        >
          <Text style={styles.debugToggleText}>
            {showDebugLogs ? '▼ Hide Target vs Time Debug Log' : `▲ In-App Debug Log (${debugLogs.length} updates recorded)`}
          </Text>
        </TouchableOpacity>

        {showDebugLogs && (
          <View style={styles.debugCard}>
            <View style={styles.debugCardHeader}>
              <Text style={styles.debugCardTitle}>ICON TARGET VS TIME TELEMETRY</Text>
              <Text style={styles.debugLiveCadence}>
                Phase: <Text style={{ color: isOffRouteSpike ? '#ef4444' : '#10b981', fontWeight: 'bold' }}>{progress.phase || 'N/A'}</Text>
              </Text>
            </View>

            <View style={styles.debugTableHeader}>
              <Text style={[styles.debugTh, { flex: 1.1 }]}>Time</Text>
              <Text style={[styles.debugTh, { flex: 0.9 }]}>Target Y</Text>
              <Text style={[styles.debugTh, { flex: 1 }]}>Phase</Text>
              <Text style={[styles.debugTh, { flex: 0.8 }]}>seg / t</Text>
              <Text style={[styles.debugTh, { flex: 1.2 }]}>Coords</Text>
            </View>

            {debugLogs.length === 0 ? (
              <Text style={styles.debugEmptyText}>Awaiting live GPS coordinates...</Text>
            ) : (
              debugLogs.map((entry) => (
                <View 
                  key={entry.id} 
                  style={[
                    styles.debugTableRow,
                    entry.ignored && styles.debugRowIgnored
                  ]}
                >
                  <Text style={[styles.debugTd, { flex: 1.1 }]}>{entry.time}</Text>
                  <Text style={[styles.debugTd, { flex: 0.9, fontWeight: '700' }]}>{entry.targetTop}px</Text>
                  <Text style={[
                    styles.debugTd, 
                    { flex: 1, color: entry.ignored ? '#dc2626' : (entry.phase === 'en_route' ? '#16a34a' : '#0284c7'), fontWeight: '600' }
                  ]}>
                    {entry.ignored ? 'OFF-RT (HELD)' : entry.phase}
                  </Text>
                  <Text style={[styles.debugTd, { flex: 0.8 }]}>{entry.segIdx} / {entry.t}</Text>
                  <Text style={[styles.debugTd, { flex: 1.2, fontSize: 8.5 }]}>{entry.lat}, {entry.lng}</Text>
                </View>
              ))
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    width: '100%'
  },
  headerBar: {
    height: BUS_STATUS_HEADER_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 16
  },
  headerColLeft: {
    width: 78,
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.8
  },
  headerColCenter: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'center',
    letterSpacing: 0.3
  },
  headerColRight: {
    width: 82,
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    textAlign: 'right'
  },
  stopsList: {
    paddingVertical: 4,
    position: 'relative'
  },
  continuousBusOverlay: {
    position: 'absolute',
    left: 91,
    top: 0,
    width: 38,
    height: 35,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    elevation: 6
  },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 88,
    paddingVertical: 0,
    paddingHorizontal: 14
  },
  myStopRow: {
    backgroundColor: '#f0f9ff'
  },
  arrivalCol: {
    width: 74,
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingVertical: 14,
    paddingRight: 4
  },
  timeStack: {
    alignItems: 'flex-start'
  },
  singleTimeText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0f172a'
  },
  pastTimeText: {
    color: '#64748b',
    fontWeight: '600'
  },
  fixedTimeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b'
  },
  delayedTimeText: {
    fontSize: 13.5,
    fontWeight: '900',
    marginTop: 2
  },
  placeholderDash: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94a3b8',
    marginTop: 1
  },
  trackCol: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    alignSelf: 'stretch'
  },
  continuousLine: {
    position: 'absolute',
    left: '50%',
    marginLeft: -3.5,
    width: 7,
    backgroundColor: '#0284c7',
    zIndex: 1,
    borderRadius: 0
  },
  continuousLineFirst: {
    top: '50%',
    bottom: -2
  },
  continuousLineMiddle: {
    top: -2,
    bottom: -2
  },
  continuousLineLast: {
    top: -2,
    bottom: '50%'
  },
  nodeCircle: {
    width: 15,
    height: 15,
    borderRadius: 7.5,
    backgroundColor: '#ffffff',
    borderWidth: 3.5,
    borderColor: '#0284c7',
    zIndex: 3
  },
  completedNodeCircle: {
    borderColor: '#94a3b8'
  },
  heroBusImage: {
    width: 38,
    height: 35,
    zIndex: 6
  },
  infoCol: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 14,
    paddingLeft: 12,
    paddingRight: 6
  },
  stopNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 4
  },
  stopNameText: {
    fontSize: 15.5,
    fontWeight: '700',
    color: '#0f172a'
  },
  myStopNameText: {
    color: '#0369a1'
  },
  starBtn: {
    padding: 3,
    justifyContent: 'center',
    alignItems: 'center'
  },
  myStopTag: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#bae6fd'
  },
  myStopTagText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#0284c7',
    letterSpacing: 0.5
  },
  pastStopText: {
    color: '#64748b'
  },
  stopMetaRow: {
    marginTop: 3
  },
  metaSub: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748b'
  },
  pastMetaText: {
    color: '#94a3b8'
  },
  currentMetaText: {
    color: '#0284c7',
    fontWeight: '800'
  },
  signalLostMetaText: {
    color: '#d97706',
    fontWeight: '800'
  },
  departureCol: {
    width: 74,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingVertical: 14,
    paddingLeft: 4
  },
  timeStackRight: {
    alignItems: 'flex-end'
  },
  singleTimeTextRight: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'right'
  },
  fixedTimeTextRight: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    textAlign: 'right'
  },
  delayedTimeTextRight: {
    fontSize: 13.5,
    fontWeight: '900',
    marginTop: 2,
    textAlign: 'right'
  },
  placeholderDashRight: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94a3b8',
    marginTop: 1,
    textAlign: 'right'
  },
  debugSection: {
    marginHorizontal: 16,
    marginVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 10
  },
  debugToggleBtn: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center'
  },
  debugToggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    letterSpacing: 0.3
  },
  debugCard: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    padding: 12,
    marginTop: 10
  },
  debugCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    paddingBottom: 6
  },
  debugCardTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#38bdf8',
    letterSpacing: 0.8
  },
  debugLiveCadence: {
    fontSize: 11,
    color: '#94a3b8'
  },
  debugTableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    paddingBottom: 4,
    marginBottom: 4
  },
  debugTh: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#94a3b8',
    textTransform: 'uppercase'
  },
  debugTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1e293b'
  },
  debugRowIgnored: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)'
  },
  debugTd: {
    fontSize: 10,
    color: '#e2e8f0'
  },
  debugEmptyText: {
    color: '#64748b',
    fontSize: 11,
    textAlign: 'center',
    paddingVertical: 10,
    fontStyle: 'italic'
  }
});
