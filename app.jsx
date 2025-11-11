import React, { useState, useEffect, useRef } from "react";
import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  addDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  doc,
  setDoc,
  deleteDoc,
  updateDoc,
  getDocs,
  where,
} from "firebase/firestore";
import { getAuth, signInAnonymously, onAuthStateChanged } from "firebase/auth";

// Your Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyBkfrF1WT_l4YxR53EhlQQ-aqUxU_Dn0bw",
  authDomain: "bleepblorp-fade4.firebaseapp.com",
  projectId: "bleepblorp-fade4",
  storageBucket: "bleepblorp-fade4.firebasestorage.app",
  messagingSenderId: "723558764239",
  appId: "1:723558764239:web:ec46a69ce53c2e39b171ba",
  measurementId: "G-1ZB9Z316C8",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const BleepBlorp = () => {
  const [username, setUsername] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userId, setUserId] = useState("");
  const [authUser, setAuthUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [currentMessage, setCurrentMessage] = useState("");
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [friends, setFriends] = useState([]);
  const [sentRequests, setSentRequests] = useState([]);
  const [receivedRequests, setReceivedRequests] = useState([]);
  const [buddyListOpen, setBuddyListOpen] = useState(true);
  const [chatOpen, setChatOpen] = useState(true);
  const [currentTime, setCurrentTime] = useState(
    new Date().toLocaleTimeString()
  );
  const [pmWindows, setPmWindows] = useState({});
  const [pmListeners, setPmListeners] = useState({}); // Track active PM listeners
  const chatScrollRef = useRef(null);
  const pmScrollRefs = useRef({});

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Listen for auth state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setAuthUser(user);
        setUserId(user.uid);
      } else {
        setAuthUser(null);
        setUserId("");
        setIsLoggedIn(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Auto-scroll PM windows to bottom
  useEffect(() => {
    Object.keys(pmWindows).forEach((user) => {
      if (pmScrollRefs.current[user]) {
        pmScrollRefs.current[user].scrollTop =
          pmScrollRefs.current[user].scrollHeight;
      }
    });
  }, [pmWindows]);

  // Handle login and set up presence
  const handleLogin = async (e) => {
    e.preventDefault();
    if (username.trim()) {
      try {
        const userCredential = await signInAnonymously(auth);
        const user = userCredential.user;

        setIsLoggedIn(true);

        await setDoc(doc(db, "users", user.uid), {
          userId: user.uid,
          username: username,
          online: true,
          lastSeen: serverTimestamp(),
        });

        await addDoc(collection(db, "messages"), {
          userId: user.uid,
          user: "SYSTEM",
          text: `*** ${username} has entered BleepBlorp ***`,
          timestamp: serverTimestamp(),
          isSystem: true,
        });
      } catch (error) {
        console.error("Error logging in:", error);
        alert("Login failed: " + error.message);
      }
    }
  };

  // Listen for online users
  useEffect(() => {
    if (!isLoggedIn || !authUser) return;

    const unsubscribe = onSnapshot(collection(db, "users"), (snapshot) => {
      const users = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }))
        .filter((user) => user.online)
        .map((user) => ({ username: user.username, userId: user.userId }));
      setOnlineUsers(users.map((u) => u.username));
    });

    return () => unsubscribe();
  }, [isLoggedIn, authUser]);

  // Listen for messages
  useEffect(() => {
    if (!isLoggedIn) return;

    const q = query(collection(db, "messages"), orderBy("timestamp", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          user: data.user,
          text: data.text,
          time:
            data.timestamp?.toDate().toLocaleTimeString() ||
            new Date().toLocaleTimeString(),
          isSystem: data.isSystem || false,
        };
      });
      setMessages(msgs);
    });

    return () => unsubscribe();
  }, [isLoggedIn]);

  // Listen for friend requests
  useEffect(() => {
    if (!isLoggedIn || !userId) return;

    const qReceived = query(
      collection(db, "friendRequests"),
      where("toId", "==", userId),
      where("status", "==", "pending")
    );

    const unsubReceived = onSnapshot(qReceived, (snapshot) => {
      const requests = snapshot.docs.map((doc) => doc.data().from);
      setReceivedRequests(requests);
    });

    const qSent = query(
      collection(db, "friendRequests"),
      where("fromId", "==", userId),
      where("status", "==", "pending")
    );

    const unsubSent = onSnapshot(qSent, (snapshot) => {
      const requests = snapshot.docs.map((doc) => doc.data().to);
      setSentRequests(requests);
    });

    return () => {
      unsubReceived();
      unsubSent();
    };
  }, [isLoggedIn, userId]);

  // Listen for friends
  useEffect(() => {
    if (!isLoggedIn || !userId) return;

    const q = query(
      collection(db, "friendships"),
      where("userIds", "array-contains", userId)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const friendsList = new Set();
      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        data.users.forEach((user) => {
          if (user !== username) friendsList.add(user);
        });
      });
      setFriends(Array.from(friendsList));
    });

    return () => unsubscribe();
  }, [isLoggedIn, userId, username]);

  // Clean up on logout/unmount
  useEffect(() => {
    if (!isLoggedIn || !authUser) return;

    const cleanup = async () => {
      try {
        await updateDoc(doc(db, "users", authUser.uid), {
          online: false,
          lastSeen: serverTimestamp(),
        });

        await addDoc(collection(db, "messages"), {
          userId: authUser.uid,
          user: "SYSTEM",
          text: `*** ${username} has left BleepBlorp ***`,
          timestamp: serverTimestamp(),
          isSystem: true,
        });
      } catch (error) {
        console.error("Error during cleanup:", error);
      }
    };

    window.addEventListener("beforeunload", cleanup);

    return () => {
      window.removeEventListener("beforeunload", cleanup);
      cleanup();
    };
  }, [isLoggedIn, authUser, username]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (currentMessage.trim() && authUser) {
      try {
        await addDoc(collection(db, "messages"), {
          userId: authUser.uid,
          user: username,
          text: currentMessage,
          timestamp: serverTimestamp(),
          isSystem: false,
        });
        setCurrentMessage("");
      } catch (error) {
        console.error("Error sending message:", error);
        alert("Failed to send message. Check console for details.");
      }
    }
  };

  const sendFriendRequest = async (user) => {
    if (
      !sentRequests.includes(user) &&
      !friends.includes(user) &&
      user !== username &&
      authUser
    ) {
      try {
        const usersQuery = query(
          collection(db, "users"),
          where("username", "==", user)
        );
        const usersSnapshot = await getDocs(usersQuery);

        if (usersSnapshot.empty) {
          console.error("User not found");
          return;
        }

        const targetUserId = usersSnapshot.docs[0].id;

        await addDoc(collection(db, "friendRequests"), {
          fromId: authUser.uid,
          toId: targetUserId,
          from: username,
          to: user,
          status: "pending",
          timestamp: serverTimestamp(),
        });

        // Friend request sent - no public message!
      } catch (error) {
        console.error("Error sending friend request:", error);
        alert("Failed to send friend request.");
      }
    }
  };

  const acceptFriendRequest = async (user) => {
    if (!authUser) return;

    try {
      const usersQuery = query(
        collection(db, "users"),
        where("username", "==", user)
      );
      const usersSnapshot = await getDocs(usersQuery);

      if (usersSnapshot.empty) {
        console.error("User not found");
        return;
      }

      const senderUserId = usersSnapshot.docs[0].data().userId;

      const q = query(
        collection(db, "friendRequests"),
        where("fromId", "==", senderUserId),
        where("toId", "==", authUser.uid),
        where("status", "==", "pending")
      );

      const snapshot = await getDocs(q);

      snapshot.docs.forEach(async (docSnap) => {
        await updateDoc(doc(db, "friendRequests", docSnap.id), {
          status: "accepted",
        });
      });

      await addDoc(collection(db, "friendships"), {
        userIds: [authUser.uid, senderUserId],
        users: [username, user],
        timestamp: serverTimestamp(),
      });

      // Friend added - no public announcement!
    } catch (error) {
      console.error("Error accepting friend request:", error);
      alert("Failed to accept friend request.");
    }
  };

  const declineFriendRequest = async (user) => {
    if (!authUser) return;

    try {
      const usersQuery = query(
        collection(db, "users"),
        where("username", "==", user)
      );
      const usersSnapshot = await getDocs(usersQuery);

      if (usersSnapshot.empty) {
        console.error("User not found");
        return;
      }

      const senderUserId = usersSnapshot.docs[0].data().userId;

      const q = query(
        collection(db, "friendRequests"),
        where("fromId", "==", senderUserId),
        where("toId", "==", authUser.uid),
        where("status", "==", "pending")
      );

      const snapshot = await getDocs(q);

      snapshot.docs.forEach(async (docSnap) => {
        await updateDoc(doc(db, "friendRequests", docSnap.id), {
          status: "declined",
        });
      });

      // Request declined - no public announcement!
    } catch (error) {
      console.error("Error declining friend request:", error);
    }
  };

  const removeFriend = async (user) => {
    if (!authUser) return;

    try {
      const q = query(
        collection(db, "friendships"),
        where("userIds", "array-contains", authUser.uid)
      );

      const snapshot = await getDocs(q);

      snapshot.docs.forEach(async (docSnap) => {
        const data = docSnap.data();
        if (data.users.includes(user)) {
          await deleteDoc(doc(db, "friendships", docSnap.id));
        }
      });

      setPmWindows((prev) => {
        if (prev[user]) {
          return {
            ...prev,
            [user]: { ...prev[user], isOpen: false },
          };
        }
        return prev;
      });

      // Friend removed - no public announcement!
    } catch (error) {
      console.error("Error removing friend:", error);
    }
  };

  // Helper function to create consistent conversation ID
  const getConversationId = async (otherUsername) => {
    const usersQuery = query(
      collection(db, "users"),
      where("username", "==", otherUsername)
    );
    const usersSnapshot = await getDocs(usersQuery);

    if (usersSnapshot.empty) return null;

    const otherUserId = usersSnapshot.docs[0].id;
    // Sort IDs to ensure same conversation ID regardless of who opens it
    const ids = [authUser.uid, otherUserId].sort();
    return ids.join("_");
  };

  const openPMWindow = async (user) => {
    if (user === username) return;
    if (!friends.includes(user)) return;
    if (!authUser) return;

    // Get conversation ID
    const conversationId = await getConversationId(user);
    if (!conversationId) return;

    // If window already exists, just reopen it
    if (pmWindows[user]) {
      setPmWindows((prev) => ({
        ...prev,
        [user]: { ...prev[user], isOpen: true },
      }));
      return;
    }

    // Create new PM window
    setPmWindows((prev) => ({
      ...prev,
      [user]: {
        messages: [],
        input: "",
        isOpen: true,
        conversationId: conversationId,
      },
    }));

    // Set up real-time listener for this conversation
    if (!pmListeners[user]) {
      const q = query(
        collection(db, "privateMessages", conversationId, "messages"),
        orderBy("timestamp", "asc")
      );

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const msgs = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            user: data.from,
            text: data.text,
            time:
              data.timestamp?.toDate().toLocaleTimeString() ||
              new Date().toLocaleTimeString(),
          };
        });

        setPmWindows((prev) => ({
          ...prev,
          [user]: {
            ...prev[user],
            messages: msgs,
          },
        }));
      });

      // Store the unsubscribe function
      setPmListeners((prev) => ({
        ...prev,
        [user]: unsubscribe,
      }));
    }
  };

  const closePMWindow = (user) => {
    setPmWindows((prev) => ({
      ...prev,
      [user]: { ...prev[user], isOpen: false },
    }));

    // Clean up the listener when closing
    if (pmListeners[user]) {
      pmListeners[user](); // Unsubscribe
      setPmListeners((prev) => {
        const newListeners = { ...prev };
        delete newListeners[user];
        return newListeners;
      });
    }
  };

  const handlePMInput = (user, value) => {
    setPmWindows((prev) => ({
      ...prev,
      [user]: { ...prev[user], input: value },
    }));
  };

  const sendPMMessage = async (user, e) => {
    e.preventDefault();
    const pmData = pmWindows[user];
    if (!pmData || !pmData.input.trim() || !authUser) return;

    try {
      const conversationId = pmData.conversationId;

      // Save message to Firebase
      await addDoc(
        collection(db, "privateMessages", conversationId, "messages"),
        {
          from: username,
          fromId: authUser.uid,
          text: pmData.input,
          timestamp: serverTimestamp(),
        }
      );

      // Clear input
      setPmWindows((prev) => ({
        ...prev,
        [user]: {
          ...prev[user],
          input: "",
        },
      }));
    } catch (error) {
      console.error("Error sending PM:", error);
      alert("Failed to send message");
    }
  };

  if (!isLoggedIn) {
    return (
      <div
        style={{
          width: "100vw",
          height: "100vh",
          background: "linear-gradient(to bottom, #008080, #004040)",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          fontFamily: '"MS Sans Serif", "Microsoft Sans Serif", sans-serif',
          padding: "20px",
        }}
      >
        <div
          style={{
            background: "#c0c0c0",
            border: "2px outset #dfdfdf",
            padding: "3px",
            width: "100%",
            maxWidth: "420px",
            boxShadow: "4px 4px 10px rgba(0,0,0,0.5)",
          }}
        >
          <div
            style={{
              background: "linear-gradient(to right, #000080, #1084d0)",
              color: "white",
              padding: "3px 5px",
              marginBottom: "3px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontWeight: "bold",
              fontSize: "11px",
            }}
          >
            <span>🔊 BleepBlorp Login</span>
            <span style={{ cursor: "pointer", fontSize: "16px" }}>✕</span>
          </div>

          <div style={{ background: "#c0c0c0", padding: "20px" }}>
            <div
              style={{
                textAlign: "center",
                marginBottom: "20px",
                fontSize: "24px",
                fontWeight: "bold",
                color: "#000080",
                textShadow: "2px 2px 0px #dfdfdf",
              }}
            >
              BleepBlorp
            </div>

            <form onSubmit={handleLogin}>
              <div style={{ marginBottom: "15px" }}>
                <label
                  style={{
                    display: "block",
                    marginBottom: "5px",
                    fontSize: "11px",
                    fontWeight: "bold",
                  }}
                >
                  Screen Name:
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "3px",
                    border: "2px inset #dfdfdf",
                    fontFamily: '"MS Sans Serif", sans-serif',
                    fontSize: "11px",
                    background: "white",
                  }}
                  placeholder="Enter screen name..."
                  maxLength={16}
                  autoFocus
                />
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  justifyContent: "center",
                }}
              >
                <button
                  type="submit"
                  style={{
                    background: "#c0c0c0",
                    border: "2px outset #dfdfdf",
                    padding: "5px 20px",
                    fontFamily: '"MS Sans Serif", sans-serif',
                    fontSize: "11px",
                    cursor: "pointer",
                    fontWeight: "bold",
                    minWidth: "75px",
                  }}
                >
                  Sign On
                </button>

                <button
                  type="button"
                  style={{
                    background: "#c0c0c0",
                    border: "2px outset #dfdfdf",
                    padding: "5px 20px",
                    fontFamily: '"MS Sans Serif", sans-serif',
                    fontSize: "11px",
                    cursor: "pointer",
                    minWidth: "75px",
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>

            <div
              style={{
                marginTop: "25px",
                fontSize: "10px",
                textAlign: "center",
                color: "#666",
              }}
            >
              BleepBlorp v2.0 • Real-time multiplayer
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#008080",
        fontFamily: '"MS Sans Serif", "Microsoft Sans Serif", sans-serif',
        overflow: "hidden",
        position: "relative",
      }}
    >
      {/* Buddy List Window */}
      {buddyListOpen && (
        <div
          style={{
            position: "absolute",
            top: "40px",
            right: "40px",
            background: "#c0c0c0",
            border: "2px outset #dfdfdf",
            width: "180px",
            boxShadow: "4px 4px 10px rgba(0,0,0,0.5)",
          }}
        >
          <div
            style={{
              background: "linear-gradient(to right, #000080, #1084d0)",
              color: "white",
              padding: "3px 5px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontWeight: "bold",
              fontSize: "11px",
              cursor: "move",
            }}
          >
            <span>
              👥 Buddy List
              {receivedRequests.length > 0 && (
                <span
                  style={{
                    background: "#cc0000",
                    color: "white",
                    padding: "1px 5px",
                    marginLeft: "5px",
                    borderRadius: "3px",
                    fontSize: "9px",
                  }}
                >
                  {receivedRequests.length}
                </span>
              )}
            </span>
            <span
              style={{ cursor: "pointer", fontSize: "16px" }}
              onClick={() => setBuddyListOpen(false)}
            >
              ✕
            </span>
          </div>

          <div style={{ padding: "8px", background: "#c0c0c0" }}>
            {receivedRequests.length > 0 && (
              <div style={{ marginBottom: "8px" }}>
                <div
                  style={{
                    fontSize: "11px",
                    fontWeight: "bold",
                    marginBottom: "5px",
                    color: "#cc0000",
                  }}
                >
                  Friend Requests ({receivedRequests.length})
                </div>
                <div
                  style={{
                    background: "#fff8dc",
                    border: "2px inset #dfdfdf",
                    padding: "4px",
                    maxHeight: "120px",
                    overflowY: "auto",
                    fontSize: "11px",
                    marginBottom: "8px",
                  }}
                >
                  {receivedRequests.map((user, i) => (
                    <div
                      key={i}
                      style={{
                        padding: "4px",
                        marginBottom: "4px",
                        borderBottom: "1px solid #e0e0e0",
                      }}
                    >
                      <div style={{ fontWeight: "bold", marginBottom: "3px" }}>
                        {user}
                      </div>
                      <div style={{ display: "flex", gap: "3px" }}>
                        <button
                          onClick={() => acceptFriendRequest(user)}
                          style={{
                            background: "#c0c0c0",
                            border: "2px outset #dfdfdf",
                            padding: "2px 6px",
                            fontFamily: '"MS Sans Serif", sans-serif',
                            fontSize: "10px",
                            cursor: "pointer",
                            flex: 1,
                          }}
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => declineFriendRequest(user)}
                          style={{
                            background: "#c0c0c0",
                            border: "2px outset #dfdfdf",
                            padding: "2px 6px",
                            fontFamily: '"MS Sans Serif", sans-serif',
                            fontSize: "10px",
                            cursor: "pointer",
                            flex: 1,
                          }}
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div
              style={{
                fontSize: "11px",
                fontWeight: "bold",
                marginBottom: "5px",
                color: "#000080",
              }}
            >
              Friends ({friends.length})
            </div>

            <div
              style={{
                background: "white",
                border: "2px inset #dfdfdf",
                padding: "4px",
                height: receivedRequests.length > 0 ? "150px" : "250px",
                overflowY: "auto",
                fontSize: "11px",
              }}
            >
              {friends.length === 0 ? (
                <div
                  style={{
                    padding: "20px",
                    textAlign: "center",
                    color: "#666",
                    fontSize: "10px",
                  }}
                >
                  No friends yet!
                  <br />
                  Send friend requests from the chat room.
                </div>
              ) : (
                friends.map((user, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "4px",
                      marginBottom: "4px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "3px",
                      borderBottom: "1px solid #e0e0e0",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        cursor: "pointer",
                        padding: "2px",
                      }}
                      onDoubleClick={() => openPMWindow(user)}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "#e0e0e0";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                      }}
                      title="Double-click to message"
                    >
                      <span
                        style={{
                          color: onlineUsers.includes(user) ? "green" : "gray",
                          marginRight: "6px",
                          fontWeight: "bold",
                        }}
                      >
                        ●
                      </span>
                      {user}
                    </div>
                    <div style={{ display: "flex", gap: "3px" }}>
                      <button
                        onClick={() => openPMWindow(user)}
                        style={{
                          background: "#c0c0c0",
                          border: "2px outset #dfdfdf",
                          padding: "2px 6px",
                          fontFamily: '"MS Sans Serif", sans-serif',
                          fontSize: "10px",
                          cursor: "pointer",
                          flex: 1,
                        }}
                      >
                        Message
                      </button>
                      <button
                        onClick={() => removeFriend(user)}
                        style={{
                          background: "#c0c0c0",
                          border: "2px outset #dfdfdf",
                          padding: "2px 6px",
                          fontFamily: '"MS Sans Serif", sans-serif',
                          fontSize: "10px",
                          cursor: "pointer",
                          flex: 1,
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Chat Window */}
      {chatOpen && (
        <div
          style={{
            position: "absolute",
            top: "40px",
            left: "40px",
            width: "700px",
            height: "500px",
            background: "#c0c0c0",
            border: "2px outset #dfdfdf",
            display: "flex",
            flexDirection: "column",
            boxShadow: "4px 4px 10px rgba(0,0,0,0.5)",
          }}
        >
          <div
            style={{
              background: "linear-gradient(to right, #000080, #1084d0)",
              color: "white",
              padding: "3px 5px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontWeight: "bold",
              fontSize: "11px",
              cursor: "move",
            }}
          >
            <span>💬 BleepBlorp Chat Room</span>
            <div>
              <span style={{ cursor: "pointer", marginRight: "8px" }}>_</span>
              <span style={{ cursor: "pointer", marginRight: "8px" }}>□</span>
              <span
                style={{ cursor: "pointer", fontSize: "16px" }}
                onClick={() => setChatOpen(false)}
              >
                ✕
              </span>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              background: "#c0c0c0",
              padding: "8px",
              height: "calc(100% - 26px)",
              gap: "8px",
            }}
          >
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                ref={chatScrollRef}
                style={{
                  background: "white",
                  border: "2px inset #dfdfdf",
                  padding: "8px",
                  overflowY: "auto",
                  fontSize: "11px",
                  marginBottom: "8px",
                  fontFamily: '"Courier New", monospace',
                  height: "360px",
                  maxHeight: "360px",
                }}
              >
                {messages.map((msg, i) => (
                  <div key={i} style={{ marginBottom: "8px" }}>
                    {msg.isSystem ? (
                      <div
                        style={{
                          color: "#666",
                          fontStyle: "italic",
                          textAlign: "center",
                        }}
                      >
                        {msg.text}
                      </div>
                    ) : (
                      <>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "baseline",
                            gap: "8px",
                          }}
                        >
                          <span
                            style={{
                              fontWeight: "bold",
                              color:
                                msg.user === username ? "#cc0000" : "#0000cc",
                            }}
                          >
                            {msg.user}:
                          </span>
                          <span style={{ fontSize: "9px", color: "#999" }}>
                            {msg.time}
                          </span>
                        </div>
                        <div style={{ marginLeft: "8px", marginTop: "2px" }}>
                          {msg.text}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>

              <form
                onSubmit={handleSendMessage}
                style={{ display: "flex", gap: "5px" }}
              >
                <input
                  type="text"
                  value={currentMessage}
                  onChange={(e) => setCurrentMessage(e.target.value)}
                  style={{
                    flex: 1,
                    padding: "4px",
                    border: "2px inset #dfdfdf",
                    fontFamily: '"MS Sans Serif", sans-serif',
                    fontSize: "11px",
                    background: "white",
                  }}
                  placeholder="Type a message..."
                />
                <button
                  type="submit"
                  style={{
                    background: "#c0c0c0",
                    border: "2px outset #dfdfdf",
                    padding: "4px 16px",
                    fontFamily: '"MS Sans Serif", sans-serif',
                    fontSize: "11px",
                    cursor: "pointer",
                    fontWeight: "bold",
                  }}
                >
                  Send
                </button>
              </form>
            </div>

            <div
              style={{
                width: "180px",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: "bold",
                  marginBottom: "5px",
                  color: "#000080",
                }}
              >
                Online ({onlineUsers.length})
              </div>

              <div
                style={{
                  background: "white",
                  border: "2px inset #dfdfdf",
                  padding: "4px",
                  flex: 1,
                  overflowY: "auto",
                  fontSize: "11px",
                }}
              >
                {onlineUsers.map((user, i) => (
                  <div
                    key={i}
                    style={{
                      padding: "4px",
                      marginBottom: "2px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "3px",
                      borderBottom: "1px solid #e0e0e0",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      <span
                        style={{
                          color: "green",
                          fontWeight: "bold",
                          fontSize: "10px",
                        }}
                      >
                        ●
                      </span>
                      <span
                        style={{
                          fontSize: "11px",
                          fontWeight: user === username ? "bold" : "normal",
                        }}
                      >
                        {user}
                      </span>
                    </div>

                    {user !== username && (
                      <>
                        {friends.includes(user) ? (
                          <div
                            style={{
                              fontSize: "9px",
                              color: "#666",
                              fontStyle: "italic",
                              textAlign: "center",
                              padding: "2px",
                            }}
                          >
                            ✓ Friend
                          </div>
                        ) : receivedRequests.includes(user) ? (
                          <div style={{ display: "flex", gap: "3px" }}>
                            <button
                              onClick={() => acceptFriendRequest(user)}
                              style={{
                                background: "#c0c0c0",
                                border: "2px outset #dfdfdf",
                                padding: "2px 4px",
                                fontFamily: '"MS Sans Serif", sans-serif',
                                fontSize: "9px",
                                cursor: "pointer",
                                flex: 1,
                              }}
                            >
                              Accept
                            </button>
                            <button
                              onClick={() => declineFriendRequest(user)}
                              style={{
                                background: "#c0c0c0",
                                border: "2px outset #dfdfdf",
                                padding: "2px 4px",
                                fontFamily: '"MS Sans Serif", sans-serif',
                                fontSize: "9px",
                                cursor: "pointer",
                                flex: 1,
                              }}
                            >
                              Decline
                            </button>
                          </div>
                        ) : sentRequests.includes(user) ? (
                          <div
                            style={{
                              fontSize: "9px",
                              color: "#999",
                              fontStyle: "italic",
                              textAlign: "center",
                              padding: "2px",
                            }}
                          >
                            Request Pending...
                          </div>
                        ) : (
                          <button
                            onClick={() => sendFriendRequest(user)}
                            style={{
                              background: "#c0c0c0",
                              border: "2px outset #dfdfdf",
                              padding: "2px 6px",
                              fontFamily: '"MS Sans Serif", sans-serif',
                              fontSize: "10px",
                              cursor: "pointer",
                              width: "100%",
                            }}
                          >
                            + Send Request
                          </button>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Private Message Windows */}
      {Object.entries(pmWindows).map(([user, pmData], index) => {
        if (!pmData.isOpen) return null;

        return (
          <div
            key={user}
            style={{
              position: "absolute",
              top: `${80 + index * 40}px`,
              left: `${300 + index * 40}px`,
              width: "400px",
              height: "400px",
              background: "#c0c0c0",
              border: "2px outset #dfdfdf",
              display: "flex",
              flexDirection: "column",
              boxShadow: "4px 4px 10px rgba(0,0,0,0.5)",
              zIndex: 100 + index,
            }}
          >
            <div
              style={{
                background: "linear-gradient(to right, #000080, #1084d0)",
                color: "white",
                padding: "3px 5px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontWeight: "bold",
                fontSize: "11px",
                cursor: "move",
              }}
            >
              <span>💬 Message with {user}</span>
              <div>
                <span style={{ cursor: "pointer", marginRight: "8px" }}>_</span>
                <span
                  style={{ cursor: "pointer", fontSize: "16px" }}
                  onClick={() => closePMWindow(user)}
                >
                  ✕
                </span>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                background: "#c0c0c0",
                padding: "8px",
                height: "calc(100% - 26px)",
              }}
            >
              <div
                ref={(el) => (pmScrollRefs.current[user] = el)}
                style={{
                  background: "white",
                  border: "2px inset #dfdfdf",
                  padding: "8px",
                  overflowY: "auto",
                  fontSize: "11px",
                  marginBottom: "8px",
                  fontFamily: '"Courier New", monospace',
                  height: "280px",
                  maxHeight: "280px",
                }}
              >
                {pmData.messages.map((msg, i) => (
                  <div key={i} style={{ marginBottom: "8px" }}>
                    {msg.isSystem ? (
                      <div
                        style={{
                          color: "#666",
                          fontStyle: "italic",
                          textAlign: "center",
                        }}
                      >
                        {msg.text}
                      </div>
                    ) : (
                      <>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "baseline",
                            gap: "8px",
                          }}
                        >
                          <span
                            style={{
                              fontWeight: "bold",
                              color:
                                msg.user === username ? "#cc0000" : "#0000cc",
                            }}
                          >
                            {msg.user}:
                          </span>
                          <span style={{ fontSize: "9px", color: "#999" }}>
                            {msg.time}
                          </span>
                        </div>
                        <div style={{ marginLeft: "8px", marginTop: "2px" }}>
                          {msg.text}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>

              <form
                onSubmit={(e) => sendPMMessage(user, e)}
                style={{ display: "flex", gap: "5px" }}
              >
                <input
                  type="text"
                  value={pmData.input}
                  onChange={(e) => handlePMInput(user, e.target.value)}
                  style={{
                    flex: 1,
                    padding: "4px",
                    border: "2px inset #dfdfdf",
                    fontFamily: '"MS Sans Serif", sans-serif',
                    fontSize: "11px",
                    background: "white",
                  }}
                  placeholder="Type a message..."
                />
                <button
                  type="submit"
                  style={{
                    background: "#c0c0c0",
                    border: "2px outset #dfdfdf",
                    padding: "4px 16px",
                    fontFamily: '"MS Sans Serif", sans-serif',
                    fontSize: "11px",
                    cursor: "pointer",
                    fontWeight: "bold",
                  }}
                >
                  Send
                </button>
              </form>
            </div>
          </div>
        );
      })}

      {/* Taskbar */}
      <div
        style={{
          position: "absolute",
          bottom: "0",
          left: "0",
          right: "0",
          background: "#c0c0c0",
          border: "2px outset #dfdfdf",
          borderBottom: "none",
          padding: "3px",
          display: "flex",
          justifyContent: "space-between",
          fontSize: "11px",
          alignItems: "center",
        }}
      >
        <button
          style={{
            background: "#c0c0c0",
            border: "2px outset #dfdfdf",
            padding: "3px 8px",
            fontFamily: '"MS Sans Serif", sans-serif',
            fontSize: "11px",
            cursor: "pointer",
            fontWeight: "bold",
            display: "flex",
            alignItems: "center",
            gap: "5px",
          }}
        >
          <span style={{ fontSize: "14px" }}>🪟</span>
          Start
        </button>

        <div
          style={{
            display: "flex",
            gap: "5px",
            alignItems: "center",
          }}
        >
          {!buddyListOpen && (
            <button
              onClick={() => setBuddyListOpen(true)}
              style={{
                background: "#c0c0c0",
                border: "2px outset #dfdfdf",
                padding: "3px 8px",
                fontSize: "11px",
                cursor: "pointer",
              }}
            >
              👥 Buddy List
            </button>
          )}

          {!chatOpen && (
            <button
              onClick={() => setChatOpen(true)}
              style={{
                background: "#c0c0c0",
                border: "2px outset #dfdfdf",
                padding: "3px 8px",
                fontSize: "11px",
                cursor: "pointer",
              }}
            >
              💬 BleepBlorp
            </button>
          )}

          {Object.entries(pmWindows).map(
            ([user, pmData]) =>
              pmData.isOpen && (
                <button
                  key={user}
                  style={{
                    background: "#c0c0c0",
                    border: "2px inset #dfdfdf",
                    padding: "3px 8px",
                    fontSize: "11px",
                    cursor: "pointer",
                  }}
                >
                  💬 {user}
                </button>
              )
          )}

          <div
            style={{
              border: "2px inset #dfdfdf",
              padding: "3px 8px",
              background: "#c0c0c0",
              minWidth: "100px",
              textAlign: "center",
            }}
          >
            {currentTime}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BleepBlorp;
