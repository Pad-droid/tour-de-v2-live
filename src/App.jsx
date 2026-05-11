import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const LOCATIONS = ["Binghamton", "San Luis Obispo", "Santa Barbara", "Las Vegas"];
const CATEGORIES = ["Beginner (V0–V3)", "Intermediate (V4–V6)", "Advanced (V7+)"];
const DEFAULT_WAVES = ["Wave 1", "Wave 2", "Wave 3", "Wave 4", "Wave 5", "Wave 6", "Wave 7", "Wave 8"];

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const blankParticipantForm = {
  name: "",
  bib: "",
  category: "Beginner (V0–V3)",
  wave: "Wave 1"
};

function App() {
  const today = new Date().toISOString().slice(0, 10);
  const initialTab = new URLSearchParams(window.location.search).get("tab") || (window.location.search.includes("display") ? "display" : "scoring");

  const [session, setSession] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [eventDate, setEventDate] = useState(today);
  const [location, setLocation] = useState("Las Vegas");
  const [eventRecord, setEventRecord] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [waves, setWaves] = useState([]);

  const [participantForm, setParticipantForm] = useState(blankParticipantForm);
  const [activeTab, setActiveTab] = useState(initialTab);
  const [finishBib, setFinishBib] = useState("");
  const [finishMessage, setFinishMessage] = useState("");
  const [now, setNow] = useState(Date.now());
  const [waveWarningsShown, setWaveWarningsShown] = useState({});
  const [activeWarning, setActiveWarning] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [loading, setLoading] = useState(false);

  const canEdit = Boolean(session);

  const availableWaves = useMemo(() => {
    return Array.from(new Set([...DEFAULT_WAVES, ...waves.map((wave) => wave.name)])).sort((a, b) => {
      const aNum = Number(a.replace(/\D/g, ""));
      const bNum = Number(b.replace(/\D/g, ""));
      return aNum - bNum;
    });
  }, [waves]);

  const waveStarts = useMemo(() => {
    const starts = {};
    waves.forEach((wave) => {
      if (wave.started_at) starts[wave.name] = Date.parse(wave.started_at);
    });
    return starts;
  }, [waves]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    async function loadEvent() {
      setLoading(true);
      const { data, error } = await supabase
        .from("events")
        .select("*")
        .eq("location", location)
        .eq("event_date", eventDate)
        .maybeSingle();

      if (error) {
        console.error(error);
        setLoading(false);
        return;
      }

      if (data) {
        setEventRecord(data);
        setLoading(false);
        return;
      }

      if (!canEdit) {
        setEventRecord(null);
        setLoading(false);
        return;
      }

      const { data: created, error: createError } = await supabase
        .from("events")
        .insert({ location, event_date: eventDate, name: "Tour de V2" })
        .select("*")
        .single();

      if (createError) console.error(createError);
      setEventRecord(created || null);
      setLoading(false);
    }

    loadEvent();
  }, [location, eventDate, canEdit]);

  useEffect(() => {
    if (!eventRecord?.id) {
      setParticipants([]);
      setWaves([]);
      return;
    }

    async function loadData() {
      const [{ data: participantRows, error: pError }, { data: waveRows, error: wError }] = await Promise.all([
        supabase.from("participants").select("*").eq("event_id", eventRecord.id).order("created_at", { ascending: true }),
        supabase.from("waves").select("*").eq("event_id", eventRecord.id).order("name", { ascending: true })
      ]);

      if (pError) console.error(pError);
      if (wError) console.error(wError);

      setParticipants(participantRows || []);
      setWaves(waveRows || []);
    }

    loadData();

    const channel = supabase
      .channel(`tour-de-v2-${eventRecord.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "participants", filter: `event_id=eq.${eventRecord.id}` }, loadData)
      .on("postgres_changes", { event: "*", schema: "public", table: "waves", filter: `event_id=eq.${eventRecord.id}` }, loadData)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [eventRecord?.id]);

  useEffect(() => {
    Object.entries(waveStarts).forEach(([waveName, startTime]) => {
      const elapsedSeconds = Math.floor((now - startTime) / 1000);
      const remainingSeconds = 30 * 60 - elapsedSeconds;

      if (remainingSeconds <= 0) return;

      const warningKey5 = `${waveName}-5`;
      const warningKey1 = `${waveName}-1`;

      if (remainingSeconds <= 5 * 60 && remainingSeconds > 5 * 60 - 2 && !waveWarningsShown[warningKey5]) {
        setActiveWarning({ message: `${waveName}: 5 minutes remaining!` });
        setWaveWarningsShown((current) => ({ ...current, [warningKey5]: true }));
      }

      if (remainingSeconds <= 60 && remainingSeconds > 58 && !waveWarningsShown[warningKey1]) {
        setActiveWarning({ message: `${waveName}: 1 minute remaining!` });
        setWaveWarningsShown((current) => ({ ...current, [warningKey1]: true }));
      }
    });
  }, [now, waveStarts, waveWarningsShown]);

  function requireStaff() {
    if (canEdit) return false;
    alert("Staff login is required for editing/scoring.");
    return true;
  }

  async function signIn() {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  function updateParticipantForm(field, value) {
    setParticipantForm((current) => ({ ...current, [field]: value }));
  }

  function getElapsedSeconds(participant) {
    const startTime = waveStarts[participant.wave];
    if (!startTime) return null;

    if (participant.finish_time) {
      return Math.min(30 * 60, Math.max(0, Math.floor((Date.parse(participant.finish_time) - startTime) / 1000)));
    }

    if (isTimeExpired(participant, waveStarts)) {
      return 30 * 60;
    }

    return null;
  }

  const pendingVerification = useMemo(
    () => participants.filter((participant) => hasCompletedOrExpired(participant, waveStarts) && !participant.scorecard_verified),
    [participants, waveStarts, now]
  );

  const leaderboard = useMemo(() => {
    return [...participants]
      .filter((participant) => participant.scorecard_verified && hasCompletedOrExpired(participant, waveStarts))
      .sort((a, b) => {
        if (b.routes_completed !== a.routes_completed) return b.routes_completed - a.routes_completed;
        const timeDifference = getElapsedSeconds(a) - getElapsedSeconds(b);
        if (timeDifference !== 0) return timeDifference;
        return 0;
      });
  }, [participants, waveStarts, now]);

  const categoryLeaderboards = useMemo(() => {
    return CATEGORIES.map((category) => ({
      category,
      climbers: leaderboard.filter((participant) => participant.category === category)
    }));
  }, [leaderboard]);

  async function addParticipant() {
    if (requireStaff() || !eventRecord?.id) return;

    const cleanName = participantForm.name.trim();
    const cleanBib = participantForm.bib.trim();

    if (!cleanName || !cleanBib) {
      alert("Name and bib number are required.");
      return;
    }

    const duplicateBib = participants.some((participant) => participant.bib === cleanBib);
    if (duplicateBib) {
      alert(`Bib ${cleanBib} already exists for this event.`);
      return;
    }

    const { error } = await supabase.from("participants").insert({
      event_id: eventRecord.id,
      name: cleanName,
      bib: cleanBib,
      category: participantForm.category,
      location,
      wave: participantForm.wave,
      routes_completed: 0,
      scorecard_verified: false
    });

    if (error) {
      alert(error.message);
      return;
    }

    setParticipantForm(blankParticipantForm);
  }

  async function startWave(selectedWave) {
    if (requireStaff() || !eventRecord?.id) return;

    const { error } = await supabase
      .from("waves")
      .upsert(
        {
          event_id: eventRecord.id,
          name: selectedWave,
          started_at: new Date().toISOString()
        },
        {
          onConflict: "event_id,name"
        }
      );

    if (error) alert(error.message);
  }

  async function addWave() {
    if (requireStaff() || !eventRecord?.id) return;

    const nextWaveNumber = availableWaves.length + 1;
    const nextWaveName = `Wave ${nextWaveNumber}`;

    const { error } = await supabase.from("waves").insert({
      event_id: eventRecord.id,
      name: nextWaveName,
      started_at: null
    });

    if (error) alert(error.message);
  }

  async function resetWave(selectedWave) {
    if (requireStaff() || !eventRecord?.id) return;

    const { error } = await supabase
      .from("waves")
      .delete()
      .eq("event_id", eventRecord.id)
      .eq("name", selectedWave);

    if (error) alert(error.message);

    setWaveWarningsShown((current) => {
      const updated = { ...current };
      delete updated[`${selectedWave}-5`];
      delete updated[`${selectedWave}-1`];
      return updated;
    });
  }

  async function recordFinishByBib() {
    if (requireStaff() || !eventRecord?.id) return;

    const cleanBib = finishBib.trim();
    if (!cleanBib) return;

    const participant = participants.find((item) => item.bib === cleanBib);
    if (!participant) {
      setFinishMessage(`No participant found with bib ${cleanBib} at ${location}.`);
      setFinishBib("");
      return;
    }

    if (!waveStarts[participant.wave]) {
      setFinishMessage(`#${participant.bib} ${participant.name} is assigned to ${participant.wave}, but that wave has not started yet.`);
      setFinishBib("");
      return;
    }

    const { error } = await supabase
      .from("participants")
      .update({ finish_time: new Date().toISOString(), time_expired: false, scorecard_verified: false })
      .eq("id", participant.id);

    if (error) {
      alert(error.message);
      return;
    }

    setFinishMessage(`Finish recorded for #${participant.bib} ${participant.name}.`);
    setFinishBib("");
  }

  async function updateParticipant(id, field, value) {
    if (requireStaff()) return;
    const { error } = await supabase.from("participants").update({ [field]: value }).eq("id", id);
    if (error) alert(error.message);
  }

  async function updateParticipantNumber(id, field, value) {
    const numericValue = Number(value);
    await updateParticipant(id, field, Number.isNaN(numericValue) ? 0 : numericValue);
  }

  async function verifyParticipant(id) {
    await updateParticipant(id, "scorecard_verified", true);
  }

  async function toggleVerified(participant) {
    await updateParticipant(participant.id, "scorecard_verified", !participant.scorecard_verified);
  }

  async function markParticipantExpired(id) {
    if (requireStaff()) return;
    const { error } = await supabase
      .from("participants")
      .update({ finish_time: null, time_expired: true, scorecard_verified: false })
      .eq("id", id);
    if (error) alert(error.message);
  }

  function requestDeleteParticipant(id) {
    setDeleteConfirmId(id);
  }

  async function confirmDeleteParticipant() {
    if (requireStaff() || !deleteConfirmId) return;
    const { error } = await supabase.from("participants").delete().eq("id", deleteConfirmId);
    if (error) alert(error.message);
    setDeleteConfirmId(null);
  }

  function cancelDeleteParticipant() {
    setDeleteConfirmId(null);
  }

  async function clearEventData() {
    if (requireStaff() || !eventRecord?.id) return;
    const confirmed = window.confirm("Clear all participants, wave starts, and scores for this event? This cannot be undone.");
    if (!confirmed) return;

    await supabase.from("participants").delete().eq("event_id", eventRecord.id);
    await supabase.from("waves").delete().eq("event_id", eventRecord.id);
    setFinishMessage("");
  }

  function exportResultsCsv() {
    const headers = ["rank", "bib", "name", "category", "location", "routes_completed", "time", "event_date"];
    const rows = leaderboard.map((participant, index) => [
      index + 1,
      participant.bib,
      participant.name,
      participant.category,
      participant.location,
      participant.routes_completed,
      formatElapsed(getElapsedSeconds(participant)),
      eventDate
    ]);

    const csv = [headers, ...rows].map((row) => row.map(csvSafe).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `tour-de-v2-${slugify(location)}-${eventDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function parseCsv(text) {
    const lines = text.split(String.fromCharCode(10)).map((line) => line.replace(String.fromCharCode(13), "")).filter(Boolean);
    if (!lines.length) return [];
    const headers = lines[0].split(",").map((header) => header.trim().toLowerCase());

    return lines.slice(1).map((line) => {
      const values = line.split(",");
      const row = {};
      headers.forEach((header, index) => {
        row[header] = (values[index] || "").trim();
      });
      return row;
    });
  }

  async function handleCsvUpload(e) {
    if (requireStaff() || !eventRecord?.id) return;

    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const text = String(reader.result || "");
      const rows = parseCsv(text);

      const toAdd = rows.map((row, index) => {
        const bibValue = (row.bib || row.bib_number || "").trim();
        const nameValue = (row.name || `${row.first_name || ""} ${row.last_name || ""}`).trim() || `Climber ${index + 1}`;
        const categoryValue = row.category || participantForm.category;
        const waveValue = row.wave || row.heat || participantForm.wave;

        if (!bibValue || !nameValue) return null;
        if (participants.some((participant) => participant.bib === bibValue)) return null;

        return {
          event_id: eventRecord.id,
          name: nameValue,
          bib: bibValue,
          category: categoryValue,
          location,
          wave: waveValue,
          routes_completed: Number(row.routes_completed || row.score || 0) || 0,
          scorecard_verified: false
        };
      }).filter(Boolean);

      if (toAdd.length) {
        const { error } = await supabase.from("participants").insert(toAdd);
        if (error) alert(error.message);
      }
    };

    reader.readAsText(file);
    e.target.value = "";
  }

  function downloadCsvTemplate() {
    const headers = ["name", "bib", "category", "wave", "routes_completed"];
    const sampleRows = [
      ["Alex Rivera", "101", "Beginner (V0–V3)", "Wave 1", ""],
      ["Maya Chen", "102", "Intermediate (V4–V6)", "Wave 1", ""],
      ["Jordan Smith", "103", "Advanced (V7+)", "Wave 2", ""]
    ];

    const csv = [headers, ...sampleRows].map((row) => row.map(csvSafe).join(",")).join(String.fromCharCode(10));
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "tour-de-v2-participant-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  const addParticipantBox = (
    <div style={sectionStyle}>
      <h2>Add Participant</h2>
      <div style={fieldStyle}>
        <input placeholder="Name" value={participantForm.name} onChange={(event) => updateParticipantForm("name", event.target.value)} style={{ ...inputStyle, marginRight: 8 }} disabled={!canEdit} />
        <input placeholder="Bib Number" value={participantForm.bib} onChange={(event) => updateParticipantForm("bib", event.target.value)} style={inputStyle} disabled={!canEdit} />
      </div>
      <div style={fieldStyle}>
        <label>Category: </label>
        <select style={inputStyle} value={participantForm.category} onChange={(event) => updateParticipantForm("category", event.target.value)} disabled={!canEdit}>
          {CATEGORIES.map((item) => <option style={optionStyle} key={item} value={item}>{item}</option>)}
        </select>
        <label style={{ marginLeft: 20 }}>Wave / Heat: </label>
        <select style={inputStyle} value={participantForm.wave} onChange={(event) => updateParticipantForm("wave", event.target.value)} disabled={!canEdit}>
          {availableWaves.map((item) => <option style={optionStyle} key={item} value={item}>{item}</option>)}
        </select>
      </div>
      <button style={buttonStyle} onClick={addParticipant} disabled={!canEdit}>Add Participant</button>
      <label style={{ ...buttonStyle, marginLeft: 8, opacity: canEdit ? 1 : 0.5 }}>
        Upload CSV
        <input type="file" accept=".csv" onChange={handleCsvUpload} style={{ display: "none" }} disabled={!canEdit} />
      </label>
      <button style={{ ...buttonStyle, marginLeft: 8 }} onClick={downloadCsvTemplate}>Download CSV Template</button>
      <div style={mutedStyle}>CSV columns: name, bib, category, wave (or heat), routes_completed/score</div>
    </div>
  );

  return (
    <div style={pageStyle}>
      {activeWarning && <Modal title={activeWarning.message} onConfirm={() => setActiveWarning(null)} confirmText="Dismiss" />}
      {deleteConfirmId && (
        <Modal title="Delete participant?" message="Are you sure you want to delete this participant?" onConfirm={confirmDeleteParticipant} onCancel={cancelDeleteParticipant} confirmText="Yes, Delete" />
      )}

      <h1>Tour de V2 Live Timing</h1>

      <div style={sectionStyle}>
        {canEdit ? (
          <>
            <span>Signed in as {session.user.email}</span>
            <button style={buttonStyle} onClick={signOut}>Sign Out</button>
          </>
        ) : (
          <>
            <strong>Staff Login: </strong>
            <input placeholder="Email" value={email} onChange={(event) => setEmail(event.target.value)} style={inputStyle} />
            <input placeholder="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} style={inputStyle} />
            <button style={buttonStyle} onClick={signIn}>Sign In</button>
            <span style={mutedStyle}> Public results and display remain viewable without login.</span>
          </>
        )}
      </div>

      <div style={sectionStyle}>
        <label>Event Location: </label>
        <select style={inputStyle} value={location} onChange={(event) => setLocation(event.target.value)}>
          {LOCATIONS.map((item) => <option style={optionStyle} key={item} value={item}>{item}</option>)}
        </select>
        <label style={{ marginLeft: 20 }}>Event Date: </label>
        <input style={inputStyle} type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} />
        {loading ? <span style={mutedStyle}> Loading event...</span> : null}
        {!eventRecord && !canEdit ? <p style={mutedStyle}>No event exists yet for this location/date. Staff must sign in once to create it.</p> : null}
      </div>

      <div style={sectionStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2>Manual Wave Control</h2>
          <button style={buttonStyle} onClick={addWave} disabled={!canEdit}>+ Add Wave</button>
        </div>
        <p style={mutedStyle}>Click Start Wave when that group actually begins. Everyone assigned to that wave gets the same official start time.</p>
        {availableWaves.map((item) => (
          <div key={item} style={waveBoxStyle}>
            <strong>{item}</strong>
            <span style={{ marginLeft: 12 }}>Start: {waveStarts[item] ? formatClockTime(waveStarts[item]) : "Not started"}</span>
            <span style={{ marginLeft: 12 }}>End: {waveStarts[item] ? formatClockTime(waveStarts[item] + 30 * 60 * 1000) : "—"}</span>
            <span style={{ marginLeft: 12 }}>Remaining: {waveStarts[item] ? formatElapsed(Math.max(0, Math.floor((waveStarts[item] + 30 * 60 * 1000 - now) / 1000))) : "—"}</span>
            <button style={{ ...buttonStyle, marginLeft: 12 }} onClick={() => startWave(item)} disabled={!canEdit}>Start Wave</button>
            <button style={{ ...buttonStyle, marginLeft: 8 }} onClick={() => resetWave(item)} disabled={!canEdit}>Reset</button>
          </div>
        ))}
      </div>

      <div style={sectionStyle}>
        <button style={smallButtonStyle} onClick={clearEventData} disabled={!canEdit}>Clear Current Event Data</button>
        <span style={{ ...mutedStyle, marginLeft: 12 }}>Data syncs live through Supabase across devices.</span>
      </div>

      {addParticipantBox}

      <div style={tabBarStyle}>
        <button style={activeTab === "scoring" ? activeTabStyle : tabButtonStyle} onClick={() => setActiveTab("scoring")}>Scoring</button>
        <button style={activeTab === "participants" ? activeTabStyle : tabButtonStyle} onClick={() => setActiveTab("participants")}>All Participants</button>
        <button style={activeTab === "results" ? activeTabStyle : tabButtonStyle} onClick={() => setActiveTab("results")}>Results</button>
        <button style={activeTab === "display" ? activeTabStyle : tabButtonStyle} onClick={() => setActiveTab("display")}>Display Screen</button>
      </div>

      {activeTab === "scoring" && (
        <>
          <div style={importantBoxStyle}>
            <h2>Record Finish by Bib</h2>
            <p style={mutedStyle}>Enter a bib number and click Record Time. The box clears immediately so staff can record the next finisher.</p>
            <input placeholder="Bib number" value={finishBib} onChange={(event) => setFinishBib(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") recordFinishByBib(); }} style={{ ...inputStyle, fontSize: 20, width: 180, marginRight: 8 }} disabled={!canEdit} />
            <button style={recordButtonStyle} onClick={recordFinishByBib} disabled={!canEdit}>Record Time</button>
            {finishMessage ? <p style={mutedStyle}>{finishMessage}</p> : null}
          </div>

          {pendingVerification.length > 0 && (
            <div style={sectionStyle}>
              <h2>Scorecard Verification Queue</h2>
              <table style={tableStyle}>
                <thead><tr><th style={cellStyle}>Bib</th><th style={cellStyle}>Name</th><th style={cellStyle}>Finish</th><th style={cellStyle}>Routes Completed</th><th style={cellStyle}>Verify</th></tr></thead>
                <tbody>
                  {pendingVerification.map((participant) => (
                    <tr key={`pending-${participant.id}`}>
                      <td style={cellStyle}>{participant.bib}</td>
                      <td style={cellStyle}>{participant.name}</td>
                      <td style={cellStyle}>{participant.time_expired ? "30:00 Max Time" : formatClockTime(participant.finish_time)}</td>
                      <td style={cellStyle}><input type="number" min="0" max="30" value={participant.routes_completed} onChange={(event) => updateParticipantNumber(participant.id, "routes_completed", event.target.value)} style={{ ...inputStyle, width: 80 }} disabled={!canEdit} /></td>
                      <td style={cellStyle}><button style={smallButtonStyle} onClick={() => verifyParticipant(participant.id)} disabled={!canEdit}>Verify Scorecard</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h2>Scoring — {location}</h2>
          <ParticipantScoringTable participants={participants} waves={availableWaves} waveStarts={waveStarts} canEdit={canEdit} getElapsedSeconds={getElapsedSeconds} updateParticipant={updateParticipant} updateParticipantNumber={updateParticipantNumber} toggleVerified={toggleVerified} markParticipantExpired={markParticipantExpired} />
        </>
      )}

      {activeTab === "participants" && <ParticipantsTable participants={participants} waves={availableWaves} canEdit={canEdit} updateParticipant={updateParticipant} requestDeleteParticipant={requestDeleteParticipant} waveStarts={waveStarts} />}
      {activeTab === "results" && <ResultsView location={location} eventDate={eventDate} leaderboard={leaderboard} categoryLeaderboards={categoryLeaderboards} getElapsedSeconds={getElapsedSeconds} exportResultsCsv={exportResultsCsv} />}
      {activeTab === "display" && <DisplayScreen location={location} eventDate={eventDate} leaderboard={leaderboard} categoryLeaderboards={categoryLeaderboards} getElapsedSeconds={getElapsedSeconds} />}
    </div>
  );
}

function ParticipantScoringTable({ participants, waves, waveStarts, canEdit, getElapsedSeconds, updateParticipant, updateParticipantNumber, toggleVerified, markParticipantExpired }) {
  return (
    <table style={tableStyle}>
      <thead><tr><th style={cellStyle}>Bib</th><th style={cellStyle}>Name</th><th style={cellStyle}>Category</th><th style={cellStyle}>Wave</th><th style={cellStyle}>Start</th><th style={cellStyle}>Finish</th><th style={cellStyle}>Time</th><th style={cellStyle}>Routes Completed</th><th style={cellStyle}>Verified</th><th style={cellStyle}>Max Time</th></tr></thead>
      <tbody>
        {participants.map((participant) => (
          <tr key={`scoring-${participant.id}`}>
            <td style={cellStyle}>{participant.bib}</td>
            <td style={cellStyle}>{participant.name}</td>
            <td style={cellStyle}>{participant.category}</td>
            <td style={cellStyle}><select style={inputStyle} value={participant.wave} onChange={(event) => updateParticipant(participant.id, "wave", event.target.value)} disabled={!canEdit}>{waves.map((item) => <option style={optionStyle} key={item} value={item}>{item}</option>)}</select></td>
            <td style={cellStyle}>{waveStarts[participant.wave] ? formatClockTime(waveStarts[participant.wave]) : "Not started"}</td>
            <td style={cellStyle}>{participant.time_expired ? "30:00 Max Time" : participant.finish_time ? formatClockTime(Date.parse(participant.finish_time)) : "Not finished"}</td>
            <td style={cellStyle}>{formatElapsed(getElapsedSeconds(participant))}</td>
            <td style={cellStyle}><input type="number" min="0" max="30" value={participant.routes_completed} onChange={(event) => updateParticipantNumber(participant.id, "routes_completed", event.target.value)} style={{ ...inputStyle, width: 80 }} disabled={!canEdit} /></td>
            <td style={cellStyle}><input type="checkbox" checked={participant.scorecard_verified} onChange={() => toggleVerified(participant)} disabled={!canEdit} /> {participant.scorecard_verified ? "Yes" : "No"}</td>
            <td style={cellStyle}>{!participant.finish_time && waveStarts[participant.wave] ? <button style={smallButtonStyle} onClick={() => markParticipantExpired(participant.id)} disabled={!canEdit}>Mark 30:00</button> : participant.time_expired ? "30:00" : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ParticipantsTable({ participants, waves, canEdit, updateParticipant, requestDeleteParticipant, waveStarts }) {
  return (
    <>
      <h2>All Participants</h2>
      <p style={mutedStyle}>Edit bib, name, category, or wave here.</p>
      <table style={tableStyle}>
        <thead><tr><th style={cellStyle}>Bib</th><th style={cellStyle}>Name</th><th style={cellStyle}>Category</th><th style={cellStyle}>Location</th><th style={cellStyle}>Wave</th><th style={cellStyle}>Wave Start</th><th style={cellStyle}>Status</th><th style={cellStyle}>Remove</th></tr></thead>
        <tbody>
          {participants.map((participant) => (
            <tr key={`participant-${participant.id}`}>
              <td style={cellStyle}><input value={participant.bib} onChange={(event) => updateParticipant(participant.id, "bib", event.target.value)} style={{ ...inputStyle, width: 80 }} disabled={!canEdit} /></td>
              <td style={cellStyle}><input value={participant.name} onChange={(event) => updateParticipant(participant.id, "name", event.target.value)} style={inputStyle} disabled={!canEdit} /></td>
              <td style={cellStyle}><select style={inputStyle} value={participant.category} onChange={(event) => updateParticipant(participant.id, "category", event.target.value)} disabled={!canEdit}>{CATEGORIES.map((item) => <option style={optionStyle} key={item} value={item}>{item}</option>)}</select></td>
              <td style={cellStyle}>{participant.location}</td>
              <td style={cellStyle}><select style={inputStyle} value={participant.wave} onChange={(event) => updateParticipant(participant.id, "wave", event.target.value)} disabled={!canEdit}>{waves.map((item) => <option style={optionStyle} key={item} value={item}>{item}</option>)}</select></td>
              <td style={cellStyle}>{waveStarts[participant.wave] ? formatClockTime(waveStarts[participant.wave]) : "Not started"}</td>
              <td style={cellStyle}>{getParticipantStatus(participant, waveStarts[participant.wave])}</td>
              <td style={cellStyle}><button style={smallButtonStyle} onClick={() => requestDeleteParticipant(participant.id)} disabled={!canEdit}>Delete</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function ResultsView({ location, eventDate, leaderboard, categoryLeaderboards, getElapsedSeconds, exportResultsCsv }) {
  return (
    <>
      <h2>Overall Results — {location}</h2>
      <p style={mutedStyle}>Date: {formatDate(eventDate)}</p>
      <p style={mutedStyle}>Ranking: Routes Completed → Shortest Time. Exact ties go to the secondary contest.</p>
      <button style={buttonStyle} onClick={exportResultsCsv}>Export Results CSV</button>
      <ResultsTable climbers={leaderboard} getElapsedSeconds={getElapsedSeconds} />

      <h2>Category Results</h2>
      {categoryLeaderboards.map(({ category, climbers }) => (
        <div key={category} style={{ marginBottom: 24 }}>
          <h3>{category}</h3>
          <ResultsTable climbers={climbers} getElapsedSeconds={getElapsedSeconds} />
        </div>
      ))}
    </>
  );
}

function Modal({ title, message, onConfirm, onCancel, confirmText }) {
  return (
    <div style={warningOverlayStyle}>
      <div style={warningBoxStyle}>
        <h1>{title}</h1>
        {message ? <p>{message}</p> : <p>Announce this to the gym.</p>}
        <button style={recordButtonStyle} onClick={onConfirm}>{confirmText || "OK"}</button>
        {onCancel ? <button style={{ ...buttonStyle, marginLeft: 8 }} onClick={onCancel}>Cancel</button> : null}
      </div>
    </div>
  );
}

function DisplayScreen({ location, eventDate, leaderboard, categoryLeaderboards, getElapsedSeconds }) {
  return (
    <div style={displayStyle}>
      <div style={displayHeaderStyle}>
        <div><div style={displayKickerStyle}>The Pad Climbing</div><h1 style={displayTitleStyle}>Tour de V2</h1><div style={displaySubheadStyle}>{location} · {formatDate(eventDate)}</div></div>
        <div style={displayRulesStyle}>Most Routes · Shortest Time</div>
      </div>
      <h2 style={displaySectionTitleStyle}>Overall Leaders</h2>
      <DisplayLeaderboard climbers={leaderboard.slice(0, 10)} getElapsedSeconds={getElapsedSeconds} />
      <div style={displayCategoryGridStyle}>
        {categoryLeaderboards.map(({ category, climbers }) => (
          <div key={category} style={displayCategoryBoxStyle}><h2 style={displayCategoryTitleStyle}>{category}</h2><DisplayLeaderboard climbers={climbers.slice(0, 5)} getElapsedSeconds={getElapsedSeconds} compact /></div>
        ))}
      </div>
    </div>
  );
}

function DisplayLeaderboard({ climbers, getElapsedSeconds, compact }) {
  if (!climbers.length) return <div style={displayEmptyStyle}>No verified results yet.</div>;
  return (
    <div>
      {climbers.map((participant, index) => {
        if (compact) {
          return <div key={`display-${participant.id}`} style={displayRowCompactStyle}><div style={displayRankStyle}>{index + 1}</div><div style={displayBibStyle}>#{participant.bib}</div><div style={displayNameBlockStyle}><div style={displayNameCompactStyle}>{participant.name}</div></div><div style={displayScoreStyle}>{participant.routes_completed}</div><div style={displayTimeStyle}>{formatElapsed(getElapsedSeconds(participant))}</div></div>;
        }
        return <div key={`display-${participant.id}`} style={displayRowStyle}><div style={displayRankStyle}>{index + 1}</div><div style={displayNameBlockStyle}><div style={displayNameStyle}>#{participant.bib} {participant.name}</div><div style={displayMetaStyle}>{participant.category}</div></div><div style={displayScoreStyle}>{participant.routes_completed}</div><div style={displayTimeStyle}>{formatElapsed(getElapsedSeconds(participant))}</div></div>;
      })}
    </div>
  );
}

function ResultsTable({ climbers, getElapsedSeconds }) {
  return (
    <table style={tableStyle}>
      <thead><tr><th style={cellStyle}>Rank</th><th style={cellStyle}>Bib</th><th style={cellStyle}>Name</th><th style={cellStyle}>Category</th><th style={cellStyle}>Location</th><th style={cellStyle}>Routes Completed</th><th style={cellStyle}>Time</th></tr></thead>
      <tbody>{climbers.map((participant, index) => <tr key={`result-${participant.id}`}><td style={cellStyle}>{index + 1}</td><td style={cellStyle}>{participant.bib}</td><td style={cellStyle}>{participant.name}</td><td style={cellStyle}>{participant.category}</td><td style={cellStyle}>{participant.location}</td><td style={cellStyle}>{participant.routes_completed}</td><td style={cellStyle}>{formatElapsed(getElapsedSeconds(participant))}</td></tr>)}</tbody>
    </table>
  );
}

function isTimeExpired(participant, waveStarts) {
  const startTime = waveStarts[participant.wave];
  if (!startTime || participant.finish_time) return false;
  return Boolean(participant.time_expired || Date.now() - startTime >= 30 * 60 * 1000);
}

function hasCompletedOrExpired(participant, waveStarts) {
  return Boolean((participant.finish_time || isTimeExpired(participant, waveStarts)) && waveStarts[participant.wave]);
}

function formatClockTime(timestamp) {
  if (!timestamp) return "—";
  return new Date(timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });
}

function formatElapsed(seconds) {
  if (seconds == null) return "—";
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${String(secs).padStart(2, "0")}`;
}

function getParticipantStatus(participant, waveStart) {
  if (participant.scorecard_verified) return "Verified";
  if (participant.time_expired) return "30:00 Max Time / Needs verification";
  if (participant.finish_time) return "Finished / Needs verification";
  if (waveStart) return "Wave started";
  return "Not started";
}

function csvSafe(value) {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes('"') || text.includes("\n")) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function formatDate(value) {
  if (!value) return "";
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString();
}

const pageStyle = { padding: 20, color: "white", background: "black", minHeight: "100vh", fontFamily: "Arial" };
const sectionStyle = { marginBottom: 20, padding: 16, border: "1px solid gray", borderRadius: 8 };
const importantBoxStyle = { ...sectionStyle, border: "2px solid white", background: "#111" };
const fieldStyle = { marginBottom: 10 };
const waveBoxStyle = { marginBottom: 10, padding: 10, border: "1px solid #555", borderRadius: 6 };
const tableStyle = { width: "100%", borderCollapse: "collapse", marginTop: 10, marginBottom: 24 };
const inputStyle = { margin: 4, padding: 6, background: "white", color: "black", border: "1px solid gray", borderRadius: 4 };
const optionStyle = { background: "white", color: "black" };
const buttonStyle = { margin: 4, padding: "8px 12px", background: "white", color: "black", border: "1px solid gray", borderRadius: 4, cursor: "pointer" };
const recordButtonStyle = { ...buttonStyle, background: "red", color: "white", fontSize: 18, fontWeight: "bold" };
const smallButtonStyle = { ...buttonStyle, padding: "4px 8px" };
const tabBarStyle = { display: "flex", gap: 8, marginBottom: 20, borderBottom: "1px solid gray", paddingBottom: 12 };
const tabButtonStyle = { ...buttonStyle, background: "#222", color: "white" };
const activeTabStyle = { ...buttonStyle, background: "white", color: "black" };
const mutedStyle = { opacity: 0.7 };
const cellStyle = { border: "1px solid gray", padding: 8, textAlign: "left" };
const warningOverlayStyle = { position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 };
const warningBoxStyle = { background: "#111", color: "white", border: "4px solid red", borderRadius: 12, padding: 32, textAlign: "center", maxWidth: 520 };
const displayStyle = { background: "#050505", border: "2px solid #333", borderRadius: 16, padding: 28, minHeight: "80vh" };
const displayHeaderStyle = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24, marginBottom: 28 };
const displayKickerStyle = { color: "#aaa", textTransform: "uppercase", letterSpacing: 4, fontSize: 14 };
const displayTitleStyle = { fontSize: 64, margin: "4px 0", lineHeight: 1 };
const displaySubheadStyle = { fontSize: 24, color: "#ddd" };
const displayRulesStyle = { fontSize: 24, fontWeight: "bold", border: "2px solid white", borderRadius: 12, padding: 12 };
const displaySectionTitleStyle = { fontSize: 36, marginTop: 12 };
const displayRowStyle = { display: "grid", gridTemplateColumns: "70px 1fr 120px 140px", alignItems: "center", gap: 16, padding: "14px 18px", marginBottom: 10, borderRadius: 14, background: "#151515", border: "1px solid #333" };
const displayRowCompactStyle = { display: "grid", gridTemplateColumns: "40px 60px 1fr 55px 80px", alignItems: "center", gap: 10, padding: "10px 12px", marginBottom: 8, borderRadius: 12, background: "#151515", border: "1px solid #333" };
const displayRankStyle = { fontSize: 32, fontWeight: "bold", textAlign: "center" };
const displayNameBlockStyle = { overflow: "hidden" };
const displayNameStyle = { fontSize: 30, fontWeight: "bold" };
const displayNameCompactStyle = { fontSize: 18, fontWeight: "bold" };
const displayMetaStyle = { color: "#aaa", fontSize: 14 };
const displayBibStyle = { fontSize: 18, fontWeight: "bold", color: "#ddd", textAlign: "center" };
const displayScoreStyle = { fontSize: 24, fontWeight: "bold", textAlign: "right" };
const displayTimeStyle = { fontSize: 30, fontFamily: "monospace", textAlign: "right" };
const displayCategoryGridStyle = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16, marginTop: 28 };
const displayCategoryBoxStyle = { border: "1px solid #333", borderRadius: 14, padding: 14, background: "#0d0d0d" };
const displayCategoryTitleStyle = { fontSize: 20, marginTop: 0 };
const displayEmptyStyle = { color: "#aaa", padding: 16, border: "1px dashed #444", borderRadius: 12 };

export default App;
