import { useEffect, useRef, useCallback, useState } from 'react';
import { socket } from '../socket';

interface PeerConnection {
  pc: RTCPeerConnection;
  stream: MediaStream | null;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export function useWebRTC(roomPlayers: string[], myId: string | null, muted: boolean, cameraOff: boolean) {
  const peers = useRef<Map<string, PeerConnection>>(new Map());
  const localStream = useRef<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [localStreamReady, setLocalStreamReady] = useState<MediaStream | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const initialized = useRef(false);

  const updateRemoteStreams = useCallback(() => {
    const map = new Map<string, MediaStream>();
    peers.current.forEach((peer, id) => {
      if (peer.stream) map.set(id, peer.stream);
    });
    setRemoteStreams(new Map(map));
  }, []);

  const getLocalStream = useCallback(async () => {
    if (localStream.current) return localStream.current;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: 'user' },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      localStream.current = stream;
      setLocalStreamReady(stream);
      setMediaError(null);
      return stream;
    } catch {
      try {
        const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true });
        localStream.current = audioOnly;
        setLocalStreamReady(audioOnly);
        setMediaError('camera');
        return audioOnly;
      } catch {
        setMediaError('all');
        return null;
      }
    }
  }, []);

  // Request media immediately on mount
  useEffect(() => {
    if (!initialized.current && myId) {
      initialized.current = true;
      getLocalStream();
    }
  }, [myId, getLocalStream]);

  const createPeerConnection = useCallback((peerId: string, initiator: boolean) => {
    if (peers.current.has(peerId)) {
      peers.current.get(peerId)!.pc.close();
    }

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const peerData: PeerConnection = { pc, stream: null };
    peers.current.set(peerId, peerData);

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        socket.emit('webrtc-ice-candidate', peerId, e.candidate.toJSON());
      }
    };

    pc.ontrack = (e) => {
      if (e.streams[0]) {
        peerData.stream = e.streams[0];
        updateRemoteStreams();
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        peers.current.delete(peerId);
        updateRemoteStreams();
      }
    };

    if (localStream.current) {
      localStream.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStream.current!);
      });
    }

    if (initiator) {
      pc.createOffer().then((offer) => {
        pc.setLocalDescription(offer);
        socket.emit('webrtc-offer', peerId, offer);
      });
    }

    return pc;
  }, [updateRemoteStreams]);

  // Signaling handlers
  useEffect(() => {
    if (!myId) return;

    const handleOffer = async (fromId: string, offer: RTCSessionDescriptionInit) => {
      await getLocalStream();
      const pc = createPeerConnection(fromId, false);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('webrtc-answer', fromId, answer);
    };

    const handleAnswer = async (fromId: string, answer: RTCSessionDescriptionInit) => {
      const peer = peers.current.get(fromId);
      if (peer) {
        await peer.pc.setRemoteDescription(new RTCSessionDescription(answer));
      }
    };

    const handleIce = async (fromId: string, candidate: RTCIceCandidateInit) => {
      const peer = peers.current.get(fromId);
      if (peer) {
        await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
    };

    const handlePlayerJoined = () => {
      // When a new player joins, initiate connections
      setTimeout(() => {
        const playerIds = roomPlayers;
        for (const pid of playerIds) {
          if (pid === myId) continue;
          if (peers.current.has(pid)) continue;
          if (myId < pid) {
            createPeerConnection(pid, true);
          }
        }
      }, 500);
    };

    socket.on('webrtc-offer', handleOffer);
    socket.on('webrtc-answer', handleAnswer);
    socket.on('webrtc-ice-candidate', handleIce);
    socket.on('player-joined', handlePlayerJoined);

    return () => {
      socket.off('webrtc-offer', handleOffer);
      socket.off('webrtc-answer', handleAnswer);
      socket.off('webrtc-ice-candidate', handleIce);
      socket.off('player-joined', handlePlayerJoined);
    };
  }, [myId, roomPlayers, getLocalStream, createPeerConnection]);

  // Connect to peers when player list changes
  useEffect(() => {
    if (!myId || roomPlayers.length < 2) return;
    for (const pid of roomPlayers) {
      if (pid === myId) continue;
      if (peers.current.has(pid)) continue;
      if (myId < pid) {
        createPeerConnection(pid, true);
      }
    }
  }, [roomPlayers, myId, createPeerConnection]);

  useEffect(() => {
    if (localStream.current) {
      localStream.current.getAudioTracks().forEach((t) => { t.enabled = !muted; });
    }
  }, [muted]);

  useEffect(() => {
    if (localStream.current) {
      localStream.current.getVideoTracks().forEach((t) => { t.enabled = !cameraOff; });
    }
  }, [cameraOff]);

  const cleanup = useCallback(() => {
    peers.current.forEach((peer) => peer.pc.close());
    peers.current.clear();
    if (localStream.current) {
      localStream.current.getTracks().forEach((t) => t.stop());
      localStream.current = null;
    }
    initialized.current = false;
    setLocalStreamReady(null);
    setRemoteStreams(new Map());
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  return { localStream: localStreamReady, remoteStreams, mediaError, cleanup };
}
