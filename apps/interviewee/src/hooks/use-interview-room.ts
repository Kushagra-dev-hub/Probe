"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import {
    SOCKET_PATH,
    type ClientToServerEvents,
    type ServerToClientEvents,
    type RoomBootstrap as ContractBootstrap,
    type RoomState as ContractRoomState,
    type EditorState as ContractEditorState,
    type TimerState as ContractTimerState,
    type SessionEnded as ContractSessionEnded,
    type ExecutionState as ContractExecutionState,
    type Evaluation as ContractEvaluation,
    type LobbyRequest as ContractLobbyRequest,
    type LobbyState as ContractLobbyState,
    type Recommendation,
} from "@probe/contract";
import { useAuth } from "@/context/auth-context";

/* ------------------------------------------------------------------ *
 * Local (page-facing) shapes. These intentionally keep the original
 * `directInterviewId` / `candidate` field names so the ported room page
 * needs no structural changes — the hook adapts to/from the contract.
 * ------------------------------------------------------------------ */

export type DirectRoomQuestion = {
    id: string;
    questionId?: string | null;
    text: string;
    setTitle?: string | null;
    type?: string | null;
    source?: string | null;
    difficulty?: string | null;
    expectedTopics?: string[];
};

export type DirectEditorState = {
    directInterviewId: string;
    roomSessionId: string;
    questionId: string | null;
    language: string;
    code: string;
    revision: number;
    updatedByUserId: string;
    updatedAt: string;
};

export type DirectRoomBootstrap = {
    directInterviewId: string;
    roundCandidateId: string;
    roomSessionId: string;
    role: "interviewer" | "candidate";
    status: string;
    scheduledAt: string | null;
    timezone: string | null;
    durationMinutes: number;
    startedAt: string | null;
    endedAt: string | null;
    candidateAdmittedAt: string | null;
    candidateInstructions: string | null;
    interviewerNotes: string | null;
    activeQuestionId: string | null;
    activeQuestionIndex: number;
    editorState: DirectEditorState | null;
    questions: DirectRoomQuestion[];
    candidate: { id: string; name: string; email: string | null; avatarUrl?: string | null; username?: string | null };
    interviewer: { memberId: string | null; name: string; email: string | null };
    permissions: { canAdmitCandidate: boolean; canRunCode: boolean; canEditCode: boolean };
};

export type DirectRoomState = Pick<
    DirectRoomBootstrap,
    "directInterviewId" | "roomSessionId" | "status" | "startedAt" | "endedAt" | "candidateAdmittedAt" | "activeQuestionId" | "activeQuestionIndex"
>;

export type DirectLobbyRequest = { directInterviewId: string; candidate: { id: string; name: string; avatarUrl?: string | null } };
export type DirectLobbyState = { directInterviewId: string; state: "waiting" | "admitted"; message?: string };
export type DirectTimerState = { directInterviewId: string; roomSessionId: string; elapsedSeconds: number; totalSeconds: number; syncedAt: string };
export type DirectSessionEnded = { directInterviewId: string; roomSessionId: string; reason: string; endedAt: string };
export type DirectExecutionState = Omit<ContractExecutionState, "interviewId"> & { directInterviewId: string };
export type DirectEvaluation = ContractEvaluation;

/* ------------------------------------------------------------------ *
 * Contract -> local adapters.
 * ------------------------------------------------------------------ */

function mapBootstrap(b: ContractBootstrap): DirectRoomBootstrap {
    return {
        directInterviewId: b.interviewId,
        roundCandidateId: b.interviewee.id,
        roomSessionId: b.roomSessionId,
        role: b.role === "interviewee" ? "candidate" : "interviewer",
        status: b.status,
        scheduledAt: b.scheduledAt,
        timezone: b.timezone,
        durationMinutes: b.durationMinutes,
        startedAt: b.startedAt,
        endedAt: b.endedAt,
        candidateAdmittedAt: b.candidateAdmittedAt,
        candidateInstructions: b.candidateInstructions,
        interviewerNotes: b.interviewerNotes,
        activeQuestionId: b.activeQuestionId,
        activeQuestionIndex: b.activeQuestionIndex,
        editorState: b.editorState ? { ...b.editorState, directInterviewId: b.editorState.interviewId } : null,
        questions: b.questions,
        candidate: b.interviewee,
        interviewer: b.interviewer,
        permissions: b.permissions,
    };
}

function mapRoomState(s: ContractRoomState): DirectRoomState {
    return {
        directInterviewId: s.interviewId,
        roomSessionId: s.roomSessionId,
        status: s.status,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
        candidateAdmittedAt: s.candidateAdmittedAt,
        activeQuestionId: s.activeQuestionId,
        activeQuestionIndex: s.activeQuestionIndex,
    };
}

const mapEditor = (e: ContractEditorState): DirectEditorState => ({ ...e, directInterviewId: e.interviewId });
const mapTimer = (t: ContractTimerState): DirectTimerState => ({ ...t, directInterviewId: t.interviewId });
const mapEnded = (s: ContractSessionEnded): DirectSessionEnded => ({ ...s, directInterviewId: s.interviewId });
const mapExecution = (x: ContractExecutionState): DirectExecutionState => ({ ...x, directInterviewId: x.interviewId });
const mapLobby = (l: ContractLobbyRequest): DirectLobbyRequest => ({ directInterviewId: l.interviewId, candidate: l.candidate });
const mapLobbyState = (l: ContractLobbyState): DirectLobbyState => ({ directInterviewId: l.interviewId, state: l.state, message: l.message });

function getExpertBaseUrl() {
    const configured = process.env.NEXT_PUBLIC_EXPERT_URL?.trim();
    const fallback = "http://localhost:3004";
    const value = configured || fallback;
    if (typeof window === "undefined") return value.replace(/\/$/, "");
    try {
        const url = new URL(value);
        if ((url.hostname === "localhost" || url.hostname === "127.0.0.1") && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
            url.hostname = window.location.hostname;
        }
        return url.toString().replace(/\/$/, "");
    } catch {
        return value.replace(/\/$/, "");
    }
}

export function useInterviewRoom(identifier: string) {
    const { session } = useAuth();
    const token = session?.access_token;
    const socketRef = useRef<Socket<ServerToClientEvents, ClientToServerEvents> | null>(null);
    const identifierRef = useRef(identifier);
    identifierRef.current = identifier;
    const baseUrl = useMemo(getExpertBaseUrl, []);

    const [connected, setConnected] = useState(false);
    const [loading, setLoading] = useState(true);
    const [joining, setJoining] = useState(false);
    const [error, setError] = useState("");
    const [bootstrap, setBootstrap] = useState<DirectRoomBootstrap | null>(null);
    const [roomState, setRoomState] = useState<DirectRoomState | null>(null);
    const [lobbyRequest, setLobbyRequest] = useState<DirectLobbyRequest | null>(null);
    const [lobbyState, setLobbyState] = useState<DirectLobbyState | null>(null);
    const [editorState, setEditorState] = useState<DirectEditorState | null>(null);
    const [timerState, setTimerState] = useState<DirectTimerState | null>(null);
    const [sessionEnded, setSessionEnded] = useState<DirectSessionEnded | null>(null);
    const [executionState, setExecutionState] = useState<DirectExecutionState | null>(null);
    const [evaluation, setEvaluation] = useState<DirectEvaluation | null>(null);
    const [signalOffer, setSignalOffer] = useState<{ directInterviewId: string; sdp: string } | null>(null);
    const [signalAnswer, setSignalAnswer] = useState<{ directInterviewId: string; sdp: string } | null>(null);
    const [signalIce, setSignalIce] = useState<{ directInterviewId: string; candidate: string } | null>(null);
    const [screenShareRequest, setScreenShareRequest] = useState<{ directInterviewId: string } | null>(null);
    const [screenShareState, setScreenShareState] = useState<{ directInterviewId: string; state: "active" | "stopped"; hasSystemAudio: boolean } | null>(null);
    const [screenOffer, setScreenOffer] = useState<{ directInterviewId: string; sdp: string } | null>(null);
    const [screenAnswer, setScreenAnswer] = useState<{ directInterviewId: string; sdp: string } | null>(null);
    const [screenIce, setScreenIce] = useState<{ directInterviewId: string; candidate: string } | null>(null);

    // Emit join-session and hydrate bootstrap from the ack. Used on first connect,
    // on every reconnect (so room membership is restored), and by reload().
    const emitJoin = useCallback((socket: Socket<ServerToClientEvents, ClientToServerEvents>) => {
        const interviewId = identifierRef.current;
        if (!interviewId) return;
        setJoining(true);
        socket.emit("direct:join-session", { interviewId }, (response) => {
            if (!response?.ok) {
                setError(response?.message || response?.error || "Could not join interview room.");
            } else if (response.data) {
                setBootstrap(mapBootstrap(response.data));
                setEditorState(response.data.editorState ? mapEditor(response.data.editorState) : null);
                setError("");
            }
            setJoining(false);
            setLoading(false);
        });
    }, []);

    useEffect(() => {
        if (!token) return;

        const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(baseUrl, {
            path: SOCKET_PATH,
            transports: ["websocket", "polling"],
            upgrade: true,
            auth: { token },
        });
        socketRef.current = socket;

        socket.on("connect", () => {
            setConnected(true);
            setError("");
            emitJoin(socket); // (re)join on every connect — survives transparent reconnects
        });
        socket.on("disconnect", () => setConnected(false));
        socket.on("connect_error", (err) => setError(err.message || "Could not connect to interview room."));

        socket.on("direct:bootstrap", (p) => {
            setBootstrap(mapBootstrap(p));
            setEditorState(p.editorState ? mapEditor(p.editorState) : null);
        });
        socket.on("direct:session-state", (p) => setRoomState(mapRoomState(p)));
        socket.on("direct:lobby-request", (p) => setLobbyRequest(mapLobby(p)));
        socket.on("direct:lobby-state", (p) => setLobbyState(mapLobbyState(p)));
        socket.on("direct:editor-state", (p) => setEditorState(mapEditor(p)));
        socket.on("direct:timer-sync", (p) => setTimerState(mapTimer(p)));
        socket.on("direct:session-ended", (p) => setSessionEnded(mapEnded(p)));
        socket.on("direct:execution-sync", (p) => setExecutionState(mapExecution(p)));
        socket.on("direct:evaluation-saved", (p) => setEvaluation(p));
        socket.on("direct:signal-offer", (p) => setSignalOffer({ directInterviewId: p.interviewId, sdp: p.sdp }));
        socket.on("direct:signal-answer", (p) => setSignalAnswer({ directInterviewId: p.interviewId, sdp: p.sdp }));
        socket.on("direct:signal-ice", (p) => setSignalIce({ directInterviewId: p.interviewId, candidate: p.candidate }));
        socket.on("direct:screen-share-requested", (p) => setScreenShareRequest({ directInterviewId: p.interviewId }));
        socket.on("direct:screen-share-state", (p) => setScreenShareState({ directInterviewId: p.interviewId, state: p.state, hasSystemAudio: p.hasSystemAudio }));
        socket.on("direct:screen-offer", (p) => setScreenOffer({ directInterviewId: p.interviewId, sdp: p.sdp }));
        socket.on("direct:screen-answer", (p) => setScreenAnswer({ directInterviewId: p.interviewId, sdp: p.sdp }));
        socket.on("direct:screen-ice", (p) => setScreenIce({ directInterviewId: p.interviewId, candidate: p.candidate }));

        return () => {
            socket.removeAllListeners();
            socket.disconnect();
            socketRef.current = null;
            setConnected(false);
        };
    }, [baseUrl, token, emitJoin]);

    const join = useCallback(async () => {
        const socket = socketRef.current;
        if (socket) emitJoin(socket);
    }, [emitJoin]);

    const withId = useCallback(<T extends object>(payload: T) => ({ interviewId: identifierRef.current, ...payload }), []);

    const admitCandidate = useCallback(async () => {
        socketRef.current?.emit("direct:admit-candidate", { interviewId: identifierRef.current }, (response) => {
            if (!response?.ok) setError(response?.message || response?.error || "Could not admit candidate.");
            else if (response.data) setBootstrap(mapBootstrap(response.data));
        });
    }, []);

    const selectQuestion = useCallback(async (questionId: string) => {
        socketRef.current?.emit("direct:select-question", { interviewId: identifierRef.current, questionId }, (response) => {
            if (!response?.ok) setError(response?.message || response?.error || "Could not change question.");
        });
    }, []);

    const syncEditorState = useCallback((payload: { questionId?: string | null; language: string; code: string; revision?: number }) => {
        socketRef.current?.emit("direct:editor-sync", withId(payload));
    }, [withId]);

    const syncTimer = useCallback((elapsedSeconds: number, totalSeconds?: number) => {
        socketRef.current?.emit("direct:timer-sync", { interviewId: identifierRef.current, elapsedSeconds, totalSeconds });
    }, []);

    const endSession = useCallback(async (reason = "completed") => {
        socketRef.current?.emit("direct:end-session", { interviewId: identifierRef.current, reason }, (response) => {
            if (!response?.ok) setError(response?.message || response?.error || "Could not end interview.");
        });
    }, []);

    const executeCode = useCallback(async (payload: { questionId?: string | null; language: string; code: string; stdin?: string | null; mode?: "run" | "submit" }) => {
        socketRef.current?.emit("direct:code-execute", withId({ mode: "run" as const, ...payload }), (response) => {
            if (!response?.ok && response?.message) setError(response.message);
        });
    }, [withId]);

    const saveEvaluation = useCallback(async (payload: { score?: number | null; recommendation: Recommendation; strengths?: string[]; concerns?: string[]; notes?: string | null }) => {
        socketRef.current?.emit("direct:evaluation-save", withId({ strengths: [], concerns: [], ...payload }), (response) => {
            if (!response?.ok) setError(response?.message || response?.error || "Could not save evaluation.");
            else if (response.data) setEvaluation(response.data);
        });
    }, [withId]);

    const sendSignalOffer = useCallback((directInterviewId: string, sdp: string) => { socketRef.current?.emit("direct:signal-offer", { interviewId: directInterviewId, sdp }); }, []);
    const sendSignalAnswer = useCallback((directInterviewId: string, sdp: string) => { socketRef.current?.emit("direct:signal-answer", { interviewId: directInterviewId, sdp }); }, []);
    const sendSignalIce = useCallback((directInterviewId: string, candidate: string) => { socketRef.current?.emit("direct:signal-ice", { interviewId: directInterviewId, candidate }); }, []);

    const requestScreenShare = useCallback(() => { socketRef.current?.emit("direct:request-screen-share", { interviewId: identifierRef.current }); }, []);
    const sendScreenShareState = useCallback((state: "active" | "stopped", hasSystemAudio = false) => { socketRef.current?.emit("direct:screen-share-state", { interviewId: identifierRef.current, state, hasSystemAudio }); }, []);
    const sendScreenOffer = useCallback((directInterviewId: string, sdp: string) => { socketRef.current?.emit("direct:screen-offer", { interviewId: directInterviewId, sdp }); }, []);
    const sendScreenAnswer = useCallback((directInterviewId: string, sdp: string) => { socketRef.current?.emit("direct:screen-answer", { interviewId: directInterviewId, sdp }); }, []);
    const sendScreenIce = useCallback((directInterviewId: string, candidate: string) => { socketRef.current?.emit("direct:screen-ice", { interviewId: directInterviewId, candidate }); }, []);

    return {
        baseUrl,
        connected,
        loading,
        joining,
        error,
        bootstrap,
        roomState,
        lobbyRequest,
        lobbyState,
        editorState,
        timerState,
        sessionEnded,
        executionState,
        evaluation,
        signalOffer,
        signalAnswer,
        signalIce,
        join,
        admitCandidate,
        selectQuestion,
        syncEditorState,
        syncTimer,
        endSession,
        executeCode,
        saveEvaluation,
        sendSignalOffer,
        sendSignalAnswer,
        sendSignalIce,
        clearSignalOffer: () => setSignalOffer(null),
        clearSignalAnswer: () => setSignalAnswer(null),
        clearSignalIce: () => setSignalIce(null),
        screenShareRequest,
        screenShareState,
        screenOffer,
        screenAnswer,
        screenIce,
        requestScreenShare,
        sendScreenShareState,
        sendScreenOffer,
        sendScreenAnswer,
        sendScreenIce,
        clearScreenShareRequest: () => setScreenShareRequest(null),
        clearScreenOffer: () => setScreenOffer(null),
        clearScreenAnswer: () => setScreenAnswer(null),
        clearScreenIce: () => setScreenIce(null),
        reload: join,
    };
}
