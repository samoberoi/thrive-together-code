import UIKit
import Capacitor
import HealthKit
import LocalAuthentication
import Security
import WebKit
import UserNotifications
import AparajitaCapacitorBiometricAuth
import AppPlugin
import PreferencesPlugin

private func bbdoNativeLog(_ message: String) {
    NSLog("[BBDO native] %@", message)
}

@objc(BBDOBiometricsPlugin)
public class BBDOBiometricsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BBDOBiometricsPlugin"
    public let jsName = "BBDOBiometrics"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "check", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise)
    ]

    private func label(for type: LABiometryType) -> String {
        switch type {
        case .faceID:
            return "Face ID"
        case .touchID:
            return "Touch ID"
        default:
            return "Face ID / Touch ID"
        }
    }

    private func typeName(for type: LABiometryType) -> String {
        switch type {
        case .faceID:
            return "faceId"
        case .touchID:
            return "touchId"
        default:
            return "none"
        }
    }

    @objc func check(_ call: CAPPluginCall) {
        bbdoNativeLog("BBDOBiometrics.check invoked")
        let context = LAContext()
        var authError: NSError?
        let canUseDeviceAuth = context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &authError)

        var biometricError: NSError?
        let canUseBiometrics = context.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &biometricError)
        let biometryType = context.biometryType

        call.resolve([
            "available": canUseDeviceAuth,
            "biometryAvailable": canUseBiometrics,
            "deviceSecure": canUseDeviceAuth,
            "biometryType": typeName(for: biometryType),
            "label": label(for: biometryType),
            "code": canUseDeviceAuth ? "available" : (authError?.code.description ?? "unavailable"),
            "reason": canUseDeviceAuth ? "Device authentication is available." : (authError?.localizedDescription ?? "Device authentication is unavailable.")
        ])
    }

    @objc func authenticate(_ call: CAPPluginCall) {
        bbdoNativeLog("BBDOBiometrics.authenticate invoked")
        let reason = call.getString("reason") ?? "Unlock bye bye diabetes"
        let context = LAContext()
        context.localizedFallbackTitle = "Use Passcode"

        var error: NSError?
        guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else {
            call.reject(error?.localizedDescription ?? "Device authentication is unavailable", "unavailable")
            return
        }

        context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason) { success, authError in
            DispatchQueue.main.async {
                if success {
                    call.resolve(["success": true])
                } else {
                    call.reject(authError?.localizedDescription ?? "Authentication failed", "authenticationFailed")
                }
            }
        }
    }
}

@objc(BBDOHealthKitPlugin)
public class BBDOHealthKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BBDOHealthKitPlugin"
    public let jsName = "BBDOHealthKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getTodayStepCount", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getHealthSnapshot", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getLatestEcg", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveWeight", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "enableBackgroundSync", returnType: CAPPluginReturnPromise)
    ]

    private let healthStore = HKHealthStore()
    private var backgroundObserversStarted = false

    private func readTypes() -> Set<HKObjectType> {
        var types = Set<HKObjectType>()
        let ids: [HKQuantityTypeIdentifier] = [
            .stepCount, .activeEnergyBurned, .distanceWalkingRunning,
            .appleExerciseTime, .bodyMass, .restingHeartRate,
            .heartRateVariabilitySDNN, .bloodGlucose
        ]
        for id in ids {
            if let t = HKQuantityType.quantityType(forIdentifier: id) { types.insert(t) }
        }
        if let sleep = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
            types.insert(sleep)
        }
        if #available(iOS 14.0, *) {
            types.insert(HKObjectType.electrocardiogramType())
        }
        return types
    }

    private func shareTypes() -> Set<HKSampleType> {
        var types = Set<HKSampleType>()
        if let w = HKQuantityType.quantityType(forIdentifier: .bodyMass) { types.insert(w) }
        return types
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        bbdoNativeLog("BBDOHealthKit.isAvailable invoked")
        call.resolve(["available": HKHealthStore.isHealthDataAvailable()])
    }

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        bbdoNativeLog("BBDOHealthKit.requestAuthorization invoked")
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("Apple Health is not available on this device", "healthkitUnavailable")
            return
        }
        healthStore.requestAuthorization(toShare: shareTypes(), read: readTypes()) { success, error in
            DispatchQueue.main.async {
                if let error = error {
                    call.reject(error.localizedDescription, "authorizationFailed")
                    return
                }
                call.resolve(["granted": success])
            }
        }
    }

    // MARK: - Write-back (weight)

    @objc func saveWeight(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable(),
              let type = HKQuantityType.quantityType(forIdentifier: .bodyMass) else {
            call.reject("Apple Health is not available", "healthkitUnavailable"); return
        }
        let kg = call.getDouble("kg") ?? 0
        guard kg > 0 else { call.reject("Invalid weight", "invalidValue"); return }
        let date = call.getString("at").flatMap { ISO8601DateFormatter().date(from: $0) } ?? Date()
        let sample = HKQuantitySample(
            type: type,
            quantity: HKQuantity(unit: HKUnit.gramUnit(with: .kilo), doubleValue: kg),
            start: date, end: date
        )
        healthStore.save(sample) { ok, err in
            DispatchQueue.main.async {
                if let err = err { call.reject(err.localizedDescription, "saveFailed"); return }
                call.resolve(["saved": ok])
            }
        }
    }

    // MARK: - Background delivery

    @objc func enableBackgroundSync(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("Apple Health is not available", "healthkitUnavailable"); return
        }
        if backgroundObserversStarted { call.resolve(["enabled": true]); return }
        backgroundObserversStarted = true

        let watchIds: [HKQuantityTypeIdentifier] = [
            .stepCount, .heartRate, .restingHeartRate,
            .heartRateVariabilitySDNN, .bloodGlucose, .bodyMass
        ]
        let plugin = self
        for id in watchIds {
            guard let type = HKQuantityType.quantityType(forIdentifier: id) else { continue }
            let observer = HKObserverQuery(sampleType: type, predicate: nil) { _, completion, _ in
                DispatchQueue.main.async {
                    plugin.notifyListeners("healthDataChanged", data: ["type": id.rawValue])
                }
                completion()
            }
            healthStore.execute(observer)
            healthStore.enableBackgroundDelivery(for: type, frequency: .immediate) { _, _ in }
        }
        call.resolve(["enabled": true])
    }

    @objc func getTodayStepCount(_ call: CAPPluginCall) {
        bbdoNativeLog("BBDOHealthKit.getTodayStepCount invoked")
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("Apple Health is not available on this device", "healthkitUnavailable")
            return
        }
        guard let stepType = HKQuantityType.quantityType(forIdentifier: .stepCount) else {
            call.reject("Step count is not available", "stepTypeUnavailable")
            return
        }

        let startOfDay = Calendar.current.startOfDay(for: Date())
        let now = Date()
        let predicate = HKQuery.predicateForSamples(withStart: startOfDay, end: now, options: .strictStartDate)
        let query = HKStatisticsQuery(quantityType: stepType, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, result, error in
            DispatchQueue.main.async {
                if let error = error {
                    call.reject(error.localizedDescription, "stepQueryFailed")
                    return
                }
                let steps = result?.sumQuantity()?.doubleValue(for: HKUnit.count()) ?? 0
                call.resolve([
                    "steps": Int(steps.rounded()),
                    "startDate": ISO8601DateFormatter().string(from: startOfDay),
                    "endDate": ISO8601DateFormatter().string(from: now)
                ])
            }
        }
        healthStore.execute(query)
    }

    // MARK: - Snapshot

    private func sumToday(_ id: HKQuantityTypeIdentifier, unit: HKUnit, completion: @escaping (Double) -> Void) {
        guard let type = HKQuantityType.quantityType(forIdentifier: id) else { completion(0); return }
        let start = Calendar.current.startOfDay(for: Date())
        let predicate = HKQuery.predicateForSamples(withStart: start, end: Date(), options: .strictStartDate)
        let q = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, result, _ in
            completion(result?.sumQuantity()?.doubleValue(for: unit) ?? 0)
        }
        healthStore.execute(q)
    }

    private func mostRecent(_ id: HKQuantityTypeIdentifier, unit: HKUnit, completion: @escaping (Double?, Date?) -> Void) {
        guard let type = HKQuantityType.quantityType(forIdentifier: id) else { completion(nil, nil); return }
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        let q = HKSampleQuery(sampleType: type, predicate: nil, limit: 1, sortDescriptors: [sort]) { _, samples, _ in
            if let s = samples?.first as? HKQuantitySample {
                completion(s.quantity.doubleValue(for: unit), s.endDate)
            } else {
                completion(nil, nil)
            }
        }
        healthStore.execute(q)
    }

    private enum BBDOSleepStage {
        case ignored
        case inBed
        case unspecified
        case core
        case deep
        case rem
        case awake
    }

    private func sleepStage(for rawValue: Int) -> BBDOSleepStage {
        // HealthKit stores sleep stage samples as integer category values.
        // Use Apple's documented raw values directly so stage reads do not depend
        // on SDK/runtime enum bridging and cannot silently drop Watch stages.
        switch rawValue {
        case 0:
            return .inBed
        case 1:
            return .unspecified
        case 2:
            return .awake
        case 3:
            return .core
        case 4:
            return .deep
        case 5:
            return .rem
        default:
            return .ignored
        }
    }

    private func sleepStageName(_ stage: BBDOSleepStage) -> String {
        switch stage {
        case .awake: return "awake"
        case .rem: return "rem"
        case .core: return "core"
        case .deep: return "deep"
        case .unspecified: return "unspecified"
        case .inBed: return "inBed"
        case .ignored: return "ignored"
        }
    }

    private func isAsleepStage(_ stage: BBDOSleepStage) -> Bool {
        switch stage {
        case .unspecified, .core, .deep, .rem:
            return true
        default:
            return false
        }
    }

    private func sleepStagePriority(_ stage: BBDOSleepStage) -> Int {
        switch stage {
        case .awake:
            return 5
        case .rem, .core, .deep:
            return 4
        case .unspecified:
            return 2
        case .inBed:
            return 1
        case .ignored:
            return 0
        }
    }

    private func clippedDuration(_ sample: HKCategorySample, start: Date, end: Date) -> TimeInterval {
        let s = max(sample.startDate, start)
        let e = min(sample.endDate, end)
        return max(0, e.timeIntervalSince(s))
    }

    /// Returns per-stage sleep minutes for last night plus bedtime / wake times.
    private func lastNightSleepBreakdown(completion: @escaping (_ awakeMin: Double, _ remMin: Double, _ coreMin: Double, _ deepMin: Double, _ unspecifiedMin: Double, _ sleepStart: Date?, _ sleepEnd: Date?) -> Void) {
        guard let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else {
            completion(0, 0, 0, 0, 0, nil, nil); return
        }
        let cal = Calendar.current
        let now = Date()
        var noonComps = cal.dateComponents([.year, .month, .day], from: now)
        noonComps.hour = 12
        noonComps.minute = 0
        noonComps.second = 0
        let noonToday = cal.date(from: noonComps) ?? now
        let rollingStart = cal.date(byAdding: .hour, value: -36, to: now) ?? now
        let previousNoon = cal.date(byAdding: .day, value: -1, to: noonToday) ?? rollingStart
        let start = min(rollingStart, previousNoon)

        // Deliberately fetch ALL sleepAnalysis category samples in the window.
        // Applying a value predicate here has proven brittle across iOS versions:
        // it can return generic asleep/awake while excluding Watch stage rows.
        // We filter by raw category value ourselves below.
        let predicate = HKQuery.predicateForSamples(withStart: start, end: now, options: [])
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
        let q = HKSampleQuery(sampleType: sleepType, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { _, samples, _ in
            let all = (samples as? [HKCategorySample]) ?? []

            // Apple Health can return overlapping records: iPhone may write an
            // in-bed/generic asleep block while Apple Watch writes REM/Core/Deep
            // segments inside the same window. Summing samples directly hides or
            // double-counts the real stages. We build the latest overnight session,
            // split it at every boundary, and let specific Watch stages win.
            let sessionSamples = all
                .filter {
                    let stage = self.sleepStage(for: $0.value)
                    return stage != .ignored
                }
                .sorted { $0.startDate < $1.startDate }

            guard !sessionSamples.isEmpty else {
                completion(0, 0, 0, 0, 0, nil, nil)
                return
            }

            let maxSessionGap: TimeInterval = 3 * 60 * 60
            var sessions: [(start: Date, end: Date)] = []
            var currentStart: Date? = nil
            var currentEnd: Date? = nil

            for sample in sessionSamples {
                if currentStart == nil || currentEnd == nil {
                    currentStart = sample.startDate
                    currentEnd = sample.endDate
                    continue
                }

                if sample.startDate.timeIntervalSince(currentEnd!) <= maxSessionGap {
                    if sample.endDate > currentEnd! { currentEnd = sample.endDate }
                } else {
                    sessions.append((start: currentStart!, end: currentEnd!))
                    currentStart = sample.startDate
                    currentEnd = sample.endDate
                }
            }
            if let cs = currentStart, let ce = currentEnd {
                sessions.append((start: cs, end: ce))
            }

            func sessionScore(_ session: (start: Date, end: Date)) -> (specific: TimeInterval, asleep: TimeInterval, end: TimeInterval) {
                var specific: TimeInterval = 0
                var asleep: TimeInterval = 0
                let overlapping = sessionSamples.filter { $0.endDate > session.start && $0.startDate < session.end }
                var boundaries = Set<Date>()
                boundaries.insert(session.start)
                boundaries.insert(session.end)
                for sample in overlapping {
                    boundaries.insert(max(sample.startDate, session.start))
                    boundaries.insert(min(sample.endDate, session.end))
                }
                let points = boundaries.sorted()
                if points.count >= 2 {
                    for idx in 0..<(points.count - 1) {
                        let segmentStart = points[idx]
                        let segmentEnd = points[idx + 1]
                        let duration = segmentEnd.timeIntervalSince(segmentStart)
                        if duration <= 0 { continue }
                        var chosenStage = BBDOSleepStage.ignored
                        for sample in overlapping where sample.startDate < segmentEnd && sample.endDate > segmentStart {
                            let stage = self.sleepStage(for: sample.value)
                            if self.sleepStagePriority(stage) > self.sleepStagePriority(chosenStage) {
                                chosenStage = stage
                            }
                        }
                        if self.isAsleepStage(chosenStage) { asleep += duration }
                        if chosenStage == .rem || chosenStage == .core || chosenStage == .deep { specific += duration }
                    }
                }
                return (specific, asleep, session.end.timeIntervalSince1970)
            }

            guard let sleepSession = sessions
                .filter({ $0.end.timeIntervalSince($0.start) >= 20 * 60 })
                .max(by: { lhs, rhs in
                    let l = sessionScore(lhs)
                    let r = sessionScore(rhs)
                    if l.specific != r.specific { return l.specific < r.specific }
                    if l.asleep != r.asleep { return l.asleep < r.asleep }
                    return l.end < r.end
                }) else {
                completion(0, 0, 0, 0, 0, nil, nil)
                return
            }

            let sessionStart = sleepSession.start
            let sessionEnd = sleepSession.end
            let relevant = sessionSamples.filter { $0.endDate > sessionStart && $0.startDate < sessionEnd }
            var boundaries = Set<Date>()
            boundaries.insert(sessionStart)
            boundaries.insert(sessionEnd)
            for sample in relevant {
                boundaries.insert(max(sample.startDate, sessionStart))
                boundaries.insert(min(sample.endDate, sessionEnd))
            }
            let points = boundaries.sorted()

            var awake: TimeInterval = 0
            var rem: TimeInterval = 0
            var core: TimeInterval = 0
            var deep: TimeInterval = 0
            var unspec: TimeInterval = 0

            if points.count >= 2 {
                for idx in 0..<(points.count - 1) {
                    let segmentStart = points[idx]
                    let segmentEnd = points[idx + 1]
                    let duration = segmentEnd.timeIntervalSince(segmentStart)
                    if duration <= 0 { continue }

                    var chosenStage = BBDOSleepStage.ignored
                    for sample in relevant {
                        if sample.startDate < segmentEnd && sample.endDate > segmentStart {
                            let stage = self.sleepStage(for: sample.value)
                            if self.sleepStagePriority(stage) > self.sleepStagePriority(chosenStage) {
                                chosenStage = stage
                            }
                        }
                    }

                    switch chosenStage {
                    case .awake:
                        awake += duration
                    case .rem:
                        rem += duration
                    case .core:
                        core += duration
                    case .deep:
                        deep += duration
                    case .unspecified:
                        unspec += duration
                    default:
                        break
                    }
                }
            }

            // Safety net: if the segmentation path still produced no specific
            // stage minutes but HealthKit did return REM/Core/Deep samples, use
            // direct clipped sums for those stages rather than displaying blanks.
            if rem + core + deep <= 0 {
                var directRem: TimeInterval = 0
                var directCore: TimeInterval = 0
                var directDeep: TimeInterval = 0
                for sample in relevant {
                    let duration = self.clippedDuration(sample, start: sessionStart, end: sessionEnd)
                    if duration <= 0 { continue }
                    switch self.sleepStage(for: sample.value) {
                    case .rem:
                        directRem += duration
                    case .core:
                        directCore += duration
                    case .deep:
                        directDeep += duration
                    default:
                        break
                    }
                }
                if directRem + directCore + directDeep > 0 {
                    rem = directRem
                    core = directCore
                    deep = directDeep
                    unspec = max(0, unspec - (directRem + directCore + directDeep))
                }
            }

            var rawCounts: [String: Int] = [:]
            for sample in relevant {
                let stageName = self.sleepStageName(self.sleepStage(for: sample.value))
                rawCounts["\(sample.value):\(stageName)", default: 0] += 1
            }
            let nonBed = relevant.filter { self.sleepStage(for: $0.value) != .inBed }
            let displayStart = nonBed.map { $0.startDate }.min() ?? sessionStart
            let displayEnd = nonBed.map { $0.endDate }.max() ?? sessionEnd
            bbdoNativeLog("Sleep breakdown samples=\(all.count) relevant=\(relevant.count) raw=\(rawCounts) REM=\(Int(rem / 60)) Core=\(Int(core / 60)) Deep=\(Int(deep / 60)) Awake=\(Int(awake / 60)) Unspecified=\(Int(unspec / 60))")
            completion(awake / 60.0, rem / 60.0, core / 60.0, deep / 60.0, unspec / 60.0, displayStart, displayEnd)
        }
        healthStore.execute(q)
    }

    @objc func getHealthSnapshot(_ call: CAPPluginCall) {
        bbdoNativeLog("BBDOHealthKit.getHealthSnapshot invoked")
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("Apple Health is not available on this device", "healthkitUnavailable")
            return
        }

        let group = DispatchGroup()
        var result: [String: Any] = [:]

        group.enter()
        sumToday(.stepCount, unit: .count()) { v in result["steps"] = Int(v.rounded()); group.leave() }
        group.enter()
        sumToday(.activeEnergyBurned, unit: .kilocalorie()) { v in result["activeCalories"] = Int(v.rounded()); group.leave() }
        group.enter()
        sumToday(.distanceWalkingRunning, unit: HKUnit.meter()) { v in result["distanceMeters"] = Int(v.rounded()); group.leave() }
        group.enter()
        sumToday(.appleExerciseTime, unit: .minute()) { v in result["exerciseMinutes"] = Int(v.rounded()); group.leave() }

        group.enter()
        mostRecent(.bodyMass, unit: HKUnit.gramUnit(with: .kilo)) { v, d in
            if let v = v { result["weightKg"] = v }
            if let d = d { result["weightAt"] = ISO8601DateFormatter().string(from: d) }
            group.leave()
        }
        group.enter()
        mostRecent(.restingHeartRate, unit: HKUnit.count().unitDivided(by: .minute())) { v, d in
            if let v = v { result["restingHeartRate"] = Int(v.rounded()) }
            if let d = d { result["restingHeartRateAt"] = ISO8601DateFormatter().string(from: d) }
            group.leave()
        }
        group.enter()
        mostRecent(.heartRateVariabilitySDNN, unit: HKUnit.secondUnit(with: .milli)) { v, d in
            if let v = v { result["hrvMs"] = Int(v.rounded()) }
            if let d = d { result["hrvAt"] = ISO8601DateFormatter().string(from: d) }
            group.leave()
        }
        group.enter()
        mostRecent(.bloodGlucose, unit: HKUnit(from: "mg/dL")) { v, d in
            if let v = v { result["glucoseMgDl"] = Int(v.rounded()) }
            if let d = d { result["glucoseAt"] = ISO8601DateFormatter().string(from: d) }
            group.leave()
        }
        group.enter()
        lastNightSleepBreakdown { awake, rem, core, deep, unspec, sStart, sEnd in
            let totalAsleep = rem + core + deep + unspec
            result["sleepHours"] = (totalAsleep / 60.0 * 10).rounded() / 10.0
            result["sleepAwakeMin"] = Int(awake.rounded())
            result["sleepRemMin"] = Int(rem.rounded())
            result["sleepCoreMin"] = Int(core.rounded())
            result["sleepDeepMin"] = Int(deep.rounded())
            result["sleepUnspecifiedMin"] = Int(unspec.rounded())
            let iso = ISO8601DateFormatter()
            if let s = sStart { result["sleepStart"] = iso.string(from: s) }
            if let e = sEnd { result["sleepEnd"] = iso.string(from: e) }
            group.leave()
        }

        group.notify(queue: .main) {
            call.resolve(result)
        }
    }


    // MARK: - ECG (Apple Watch)

    @available(iOS 14.0, *)
    private func classificationLabel(_ c: HKElectrocardiogram.Classification) -> String {
        switch c {
        case .sinusRhythm: return "Sinus Rhythm"
        case .atrialFibrillation: return "Atrial Fibrillation"
        case .inconclusiveLowHeartRate: return "Inconclusive · Low heart rate"
        case .inconclusiveHighHeartRate: return "Inconclusive · High heart rate"
        case .inconclusivePoorReading: return "Inconclusive · Poor reading"
        case .inconclusiveOther: return "Inconclusive"
        case .unrecognized: return "Unrecognized"
        case .notSet: return "Not set"
        @unknown default: return "Unknown"
        }
    }

    @available(iOS 14.0, *)
    private func symptomsLabel(_ s: HKElectrocardiogram.SymptomsStatus) -> String {
        switch s {
        case .present: return "present"
        case .none: return "none"
        case .notSet: return "not recorded"
        @unknown default: return "unknown"
        }
    }

    @objc func getLatestEcg(_ call: CAPPluginCall) {
        bbdoNativeLog("BBDOHealthKit.getLatestEcg invoked")
        guard HKHealthStore.isHealthDataAvailable() else {
            call.reject("Apple Health is not available on this device", "healthkitUnavailable"); return
        }
        guard #available(iOS 14.0, *) else {
            call.resolve([:]); return
        }
        let ecgType = HKObjectType.electrocardiogramType()
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        let sampleQuery = HKSampleQuery(sampleType: ecgType, predicate: nil, limit: 1, sortDescriptors: [sort]) { [weak self] _, samples, err in
            guard let self = self else { return }
            if let err = err {
                DispatchQueue.main.async { call.reject(err.localizedDescription, "ecgQueryFailed") }
                return
            }
            guard let ecg = samples?.first as? HKElectrocardiogram else {
                DispatchQueue.main.async { call.resolve([:]) }
                return
            }
            var result: [String: Any] = [
                "classification": self.classificationLabel(ecg.classification),
                "symptomsStatus": self.symptomsLabel(ecg.symptomsStatus),
                "numberOfVoltageMeasurements": ecg.numberOfVoltageMeasurements,
                "samplingFrequencyHz": ecg.samplingFrequency?.doubleValue(for: HKUnit.hertz()) ?? 0,
                "startDate": ISO8601DateFormatter().string(from: ecg.startDate),
                "endDate": ISO8601DateFormatter().string(from: ecg.endDate)
            ]
            if let hr = ecg.averageHeartRate?.doubleValue(for: HKUnit.count().unitDivided(by: .minute())) {
                result["averageHeartRate"] = Int(hr.rounded())
            }

            // Downsample voltages to at most ~600 points for a compact waveform.
            var voltages: [Double] = []
            let total = ecg.numberOfVoltageMeasurements
            let maxPoints = 600
            let stride = max(1, total / maxPoints)
            var index = 0
            let voltageQuery = HKElectrocardiogramQuery(ecg) { _, voltageResult in
                switch voltageResult {
                case .measurement(let m):
                    if let q = m.quantity(for: .appleWatchSimilarToLeadI) {
                        if index % stride == 0 {
                            voltages.append(q.doubleValue(for: HKUnit.voltUnit(with: .micro)))
                        }
                        index += 1
                    }
                case .done:
                    result["voltagesMicroV"] = voltages
                    DispatchQueue.main.async { call.resolve(result) }
                case .error(let e):
                    DispatchQueue.main.async { call.reject(e.localizedDescription, "ecgVoltageFailed") }
                @unknown default:
                    DispatchQueue.main.async { call.resolve(result) }
                }
            }
            self.healthStore.execute(voltageQuery)
        }
        healthStore.execute(sampleQuery)
    }
}


final class BBDOYouTubePlayerViewController: UIViewController, WKNavigationDelegate, WKUIDelegate {
    private let videoId: String
    private let videoTitle: String
    private let start: Int
    private var webView: WKWebView?
    private var onClose: (() -> Void)?

    init(videoId: String, title: String, start: Int, onClose: (() -> Void)? = nil) {
        self.videoId = videoId
        self.videoTitle = title
        self.start = max(0, start)
        self.onClose = onClose
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = .fullScreen
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.allowsAirPlayForMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        if #available(iOS 15.4, *) {
            config.preferences.isElementFullscreenEnabled = true
        }

        let player = WKWebView(frame: .zero, configuration: config)
        player.translatesAutoresizingMaskIntoConstraints = false
        player.backgroundColor = .black
        player.isOpaque = false
        player.navigationDelegate = self
        player.uiDelegate = self
        view.addSubview(player)
        webView = player

        let closeButton = UIButton(type: .system)
        closeButton.translatesAutoresizingMaskIntoConstraints = false
        closeButton.setTitle("✕", for: .normal)
        closeButton.titleLabel?.font = UIFont.systemFont(ofSize: 24, weight: .bold)
        closeButton.tintColor = .white
        closeButton.backgroundColor = UIColor.black.withAlphaComponent(0.55)
        closeButton.layer.cornerRadius = 22
        closeButton.addTarget(self, action: #selector(closePlayer), for: .touchUpInside)
        view.addSubview(closeButton)

        NSLayoutConstraint.activate([
            player.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            player.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            player.topAnchor.constraint(equalTo: view.topAnchor),
            player.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            closeButton.widthAnchor.constraint(equalToConstant: 44),
            closeButton.heightAnchor.constraint(equalToConstant: 44),
            closeButton.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12),
            closeButton.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -12)
        ])

        loadVideo()
    }

    private func loadVideo() {
        guard var components = URLComponents(string: "https://www.youtube.com/embed/\(videoId)") else { return }
        components.queryItems = [
            URLQueryItem(name: "autoplay", value: "1"),
            URLQueryItem(name: "controls", value: "1"),
            URLQueryItem(name: "rel", value: "0"),
            URLQueryItem(name: "modestbranding", value: "1"),
            URLQueryItem(name: "playsinline", value: "0"),
            URLQueryItem(name: "fs", value: "1"),
            URLQueryItem(name: "start", value: String(start)),
            URLQueryItem(name: "cc_load_policy", value: "0"),
            URLQueryItem(name: "cc_lang_pref", value: "none"),
            URLQueryItem(name: "hl", value: "en"),
            URLQueryItem(name: "iv_load_policy", value: "3"),
            URLQueryItem(name: "origin", value: "https://app.byebyediabetes.com"),
            URLQueryItem(name: "widget_referrer", value: "https://app.byebyediabetes.com")
        ]
        guard let url = components.url else { return }
        var request = URLRequest(url: url)
        request.setValue("https://app.byebyediabetes.com/", forHTTPHeaderField: "Referer")
        request.setValue("https://app.byebyediabetes.com", forHTTPHeaderField: "Origin")
        webView?.load(request)
    }

    @objc private func closePlayer() {
        let callback = onClose
        onClose = nil
        callback?()
        webView?.stopLoading()
        webView?.removeFromSuperview()
        webView = nil
        dismiss(animated: false)
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        // YouTube's own fullscreen media controller can temporarily cover this
        // view and trigger viewWillDisappear. Do NOT resolve the JS promise in
        // that case, otherwise React thinks the video has closed while playback
        // is still active and the app can show the lock/loading shield on exit.
        guard isBeingDismissed || navigationController?.isBeingDismissed == true else { return }
        // Safety net: if the VC is truly being dismissed via any path other
        // than our ✕ button, still resolve the JS promise.
        webView?.stopLoading()
        webView = nil
        if let callback = onClose {
            onClose = nil
            DispatchQueue.main.async { callback() }
        }
    }
}

@objc(BBDOYouTubePlayerPlugin)
public class BBDOYouTubePlayerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BBDOYouTubePlayerPlugin"
    public let jsName = "BBDOYouTubePlayer"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise)
    ]

    @objc func open(_ call: CAPPluginCall) {
        guard let videoId = call.getString("videoId"), videoId.range(of: "^[A-Za-z0-9_-]{11}$", options: .regularExpression) != nil else {
            call.reject("Invalid YouTube video id", "invalidVideoId")
            return
        }
        let title = call.getString("title") ?? "Video"
        let start = call.getInt("start") ?? 0

        DispatchQueue.main.async { [weak self] in
            guard let self = self, let presenter = self.bridge?.viewController else {
                call.reject("Player is unavailable", "playerUnavailable")
                return
            }
            let playerStart = Date()
            let player = BBDOYouTubePlayerViewController(videoId: videoId, title: title, start: start) {
                call.resolve(["closed": true, "elapsedSec": max(1, Int(Date().timeIntervalSince(playerStart).rounded()))])
            }
            presenter.present(player, animated: true)
        }
    }
}

@objc(BBDONativeAuthStorePlugin)
public class BBDONativeAuthStorePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BBDONativeAuthStorePlugin"
    public let jsName = "BBDONativeAuthStore"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getTokens", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setTokens", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearTokens", returnType: CAPPluginReturnPromise)
    ]

    private let service = "app.lovable.byebyediabetes.auth"
    private let account = "session"

    private func baseQuery() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
    }

    @objc func getTokens(_ call: CAPPluginCall) {
        var query = baseQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else {
            call.resolve(["hasTokens": false])
            return
        }

        do {
            let object = try JSONSerialization.jsonObject(with: data) as? [String: String]
            call.resolve([
                "hasTokens": true,
                "access_token": object?["access_token"] ?? "",
                "refresh_token": object?["refresh_token"] ?? ""
            ])
        } catch {
            call.reject("Stored auth tokens are unreadable", "decodeFailed")
        }
    }

    @objc func setTokens(_ call: CAPPluginCall) {
        guard let accessToken = call.getString("access_token"), let refreshToken = call.getString("refresh_token") else {
            call.reject("Missing auth tokens", "missingTokens")
            return
        }

        do {
            let data = try JSONSerialization.data(withJSONObject: [
                "access_token": accessToken,
                "refresh_token": refreshToken
            ])
            SecItemDelete(baseQuery() as CFDictionary)
            var attributes = baseQuery()
            attributes[kSecValueData as String] = data
            attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            let status = SecItemAdd(attributes as CFDictionary, nil)
            if status == errSecSuccess {
                bbdoNativeLog("Native auth tokens stored in Keychain")
                call.resolve(["saved": true])
            } else {
                call.reject("Keychain save failed", "keychainSaveFailed", NSError(domain: NSOSStatusErrorDomain, code: Int(status)))
            }
        } catch {
            call.reject(error.localizedDescription, "encodeFailed")
        }
    }

    @objc func clearTokens(_ call: CAPPluginCall) {
        SecItemDelete(baseQuery() as CFDictionary)
        call.resolve(["cleared": true])
    }
}

@objc(BBDONotificationsPlugin)
public class BBDONotificationsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BBDONotificationsPlugin"
    public let jsName = "BBDONotifications"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "refreshAuthorization", returnType: CAPPluginReturnPromise)
    ]

    @objc func refreshAuthorization(_ call: CAPPluginCall) {
        var options: UNAuthorizationOptions = [.alert, .sound, .badge]

        UNUserNotificationCenter.current().requestAuthorization(options: options) { _, error in
            if let error = error {
                call.reject(error.localizedDescription, "notificationAuthorizationFailed")
                return
            }

            UNUserNotificationCenter.current().getNotificationSettings { settings in
                var result: [String: Any] = [
                    "authorizationStatus": settings.authorizationStatus.rawValue,
                    "soundSetting": settings.soundSetting.rawValue,
                    "alertSetting": settings.alertSetting.rawValue
                ]
                bbdoNativeLog("notification authorization refreshed authorization=\(settings.authorizationStatus.rawValue) sound=\(settings.soundSetting.rawValue)")
                call.resolve(result)
            }
        }
    }
}

@objc(BBDOBridgeViewController)
class BBDOBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bbdoNativeLog("BBDOBridgeViewController.capacitorDidLoad")
        bridge?.webView?.configuration.allowsInlineMediaPlayback = true
        bridge?.webView?.configuration.mediaTypesRequiringUserActionForPlayback = []
        bridge?.webView?.scrollView.minimumZoomScale = 1.0
        bridge?.webView?.scrollView.maximumZoomScale = 1.0
        bridge?.webView?.scrollView.zoomScale = 1.0
        bridge?.webView?.scrollView.bouncesZoom = false
        // Enable the standard iOS edge-swipe navigation gestures inside the
        // WKWebView: swipe from the left edge = go back, swipe from the right
        // edge = go forward. WKWebView records SPA pushState entries in its
        // back/forward list, so this works with React Router as-is.
        bridge?.webView?.allowsBackForwardNavigationGestures = true
        bridge?.registerPluginInstance(BBDOBiometricsPlugin())
        bridge?.registerPluginInstance(BBDONativeAuthStorePlugin())
        bridge?.registerPluginInstance(BBDONotificationsPlugin())
        bridge?.registerPluginInstance(BBDOHealthKitPlugin())
        bridge?.registerPluginInstance(BBDOYouTubePlayerPlugin())
        bbdoNativeLog("Custom native plugins registered")
    }
}

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        bbdoNativeLog("application didFinishLaunching")
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            bbdoNativeLog("notification settings authorization=\(settings.authorizationStatus.rawValue) alert=\(settings.alertSetting.rawValue) sound=\(settings.soundSetting.rawValue)")
        }
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    // MARK: - APNs push forwarding
    // Capacitor's PushNotifications plugin listens on NotificationCenter for these
    // events. Without these UIApplicationDelegate methods the plugin never receives
    // the device token and `register()` silently fails.

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        bbdoNativeLog("APNs registered device token")
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        bbdoNativeLog("APNs registration failed: \(error.localizedDescription)")
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

}
