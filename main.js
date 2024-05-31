import "./style.css";

import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  addDoc,
  setDoc,
  doc,
  getDoc,
  updateDoc,
  onSnapshot,
} from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCsnu4LlkAnwjNKlvU4h0XTnBn3dd8yfEk",
  authDomain: "reddit-clone-76d57.firebaseapp.com",
  projectId: "reddit-clone-76d57",
  storageBucket: "reddit-clone-76d57.appspot.com",
  messagingSenderId: "103657849892",
  appId: "1:103657849892:web:54fecec73e3c97b53d04b1",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

const firestore = getFirestore(app);

const servers = {
  iceServers: [
    {
      urls: ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"],
    },
  ],
  iceCandidatePoolSize: 10,
};

// Global State
let pc = new RTCPeerConnection(servers);
let localStream = null;
let remoteStream = null;

// HTML elements
const webcamButton = document.getElementById("webcamButton");
const webcamVideo = document.getElementById("webcamVideo");
const callButton = document.getElementById("callButton");
const callInput = document.getElementById("callInput");
const answerButton = document.getElementById("answerButton");
const remoteVideo = document.getElementById("remoteVideo");
const hangupButton = document.getElementById("hangupButton");

// 1. Setup media sources
webcamButton.onclick = async () => {
  localStream = await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true,
  });

  remoteStream = new MediaStream();

  // Push tracks from local stream to peer connection
  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
  });

  // Pull tracks from remote stream, add to video stream
  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
    });
  };

  webcamVideo.srcObject = localStream;
  remoteVideo.srcObject = remoteStream;

  callButton.disabled = false;
  answerButton.disabled = false;
  webcamButton.disabled = true;
};

// 2. Create an offer
callButton.onclick = async () => {
  const callDocRef = doc(collection(firestore, "calls"));
  const offerCandidates = collection(callDocRef, "offerCandidates");
  const answerCandidates = collection(callDocRef, "answerCandidates");

  callInput.value = callDocRef.id;

  pc.onicecandidate = async (event) => {
    if (event.candidate) {
      console.log("Sending ICE candidate:", event.candidate);
      await addDoc(offerCandidates, event.candidate.toJSON());
    }
  };

  const offerDescription = await pc.createOffer();
  await pc.setLocalDescription(offerDescription);

  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type,
  };

  await setDoc(callDocRef, { offer });

  onSnapshot(callDocRef, (snapshot) => {
    const data = snapshot.data();
    if (data && !pc.currentRemoteDescription && data.answer) {
      const answerDescription = new RTCSessionDescription(data.answer);
      pc.setRemoteDescription(answerDescription);
    }
  });

  onSnapshot(answerCandidates, (snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === "added") {
        const candidate = new RTCIceCandidate(change.doc.data());
        pc.addIceCandidate(candidate);
      }
    });
  });

  hangupButton.disabled = false;
};

// 3. Answer the call with the unique ID
answerButton.onclick = async () => {
  const callId = callInput.value;
  const callDocRef = doc(firestore, "calls", callId);
  const answerCandidates = collection(callDocRef, "answerCandidates");
  const offerCandidates = collection(callDocRef, "offerCandidates");

  pc.onicecandidate = async (event) => {
    if (event.candidate) {
      console.log("Sending ICE candidate:", event.candidate);
      await addDoc(answerCandidates, event.candidate.toJSON());
    }
  };

  const callDoc = await getDoc(callDocRef);
  const callData = callDoc.data();

  if (callData?.offer) {
    const offerDescription = callData.offer;
    await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

    const answerDescription = await pc.createAnswer();
    await pc.setLocalDescription(answerDescription);

    const answer = {
      type: answerDescription.type,
      sdp: answerDescription.sdp,
    };

    await updateDoc(callDocRef, { answer });

    onSnapshot(offerCandidates, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === "added") {
          const candidate = new RTCIceCandidate(change.doc.data());
          pc.addIceCandidate(candidate);
        }
      });
    });
  }
};
