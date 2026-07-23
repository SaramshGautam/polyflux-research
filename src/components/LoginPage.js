import React, { useState, useEffect } from "react";
import {
  signInWithPopup,
  signInWithEmailAndPassword,
  signInAnonymously,
  updateProfile,
} from "firebase/auth";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { useNavigate } from "react-router-dom";
import { useFlashMessage } from "../FlashMessageContext";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import { db, auth, googleProvider } from "../firebaseConfig";

const LoginPage = () => {
  const DEVELOPER_EMAIL = "saramshgautam@gmail.com";

  const accessMailto = `mailto:${DEVELOPER_EMAIL}?subject=${encodeURIComponent(
    "Requesting access to PolyFlux"
  )}&body=${encodeURIComponent(
    "Hi,\n\nI want to use PolyFlux and need access.\n\nName: (Enter your name)\nEmail: (Enter your email)\nPassword: (Enter a password)\n\nThanks."
  )}`;

  const [message, setMessage] = useState(null); // optional local messages

  // --- Primary "sign in with email" flow (two steps: email -> confirm ID) ---
  const [step, setStep] = useState("email"); // "email" | "confirm"
  const [primaryEmail, setPrimaryEmail] = useState("");
  const [primaryParticipantId, setPrimaryParticipantId] = useState("");
  const [primarySubmitting, setPrimarySubmitting] = useState(false);
  const [confirmedUserData, setConfirmedUserData] = useState(null);
  const [prefilledFromLink, setPrefilledFromLink] = useState(false);

  // --- "Sign in with LSU ID" (email/password) flow, tucked behind a link ---
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const navigate = useNavigate();
  const addMessage = useFlashMessage();

  useEffect(() => {
    document.body.classList.add("login-page");
    return () => {
      document.body.classList.remove("login-page");
    };
  }, []);

  // Support personalized "magic links" like:
  //   /login?email=p014@lsu.edu&pid=P014
  // so participants don't have to type anything on the day of the study.
  // We still look the email up (rather than trusting the link blindly) so
  // the confirm step below shows real, current assignment data.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const linkEmail = params.get("email");
    const linkPid = params.get("pid");

    if (!linkEmail || !linkPid) return;

    const normalizedEmail = linkEmail.trim().toLowerCase();
    setPrimaryEmail(normalizedEmail);
    setPrimaryParticipantId(linkPid.trim());
    setPrefilledFromLink(true);

    (async () => {
      try {
        const userDocRef = doc(db, "users", normalizedEmail);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          setConfirmedUserData(userDocSnap.data());
          setStep("confirm");
        }
      } catch (err) {
        console.error("Prefill lookup failed:", err);
      }
    })();
  }, []);

  const resetToEmailStep = () => {
    setStep("email");
    setPrimaryEmail("");
    setPrimaryParticipantId("");
    setConfirmedUserData(null);
    setPrefilledFromLink(false);
  };

  // Step 1: user enters their email. We confirm it exists in the system
  // (or, for the developer email, skip straight to full admin access)
  // before moving on to the participant ID confirmation step.
  const handleEmailContinue = async (e) => {
    e.preventDefault();
    const normalizedEmail = primaryEmail.trim().toLowerCase();

    if (!normalizedEmail) {
      addMessage("danger", "Please enter your email.");
      return;
    }

    setPrimarySubmitting(true);

    try {
      // Developer email: grant full admin access immediately, no
      // participant ID confirmation needed.
      if (normalizedEmail === DEVELOPER_EMAIL.toLowerCase()) {
        const userDocRef = doc(db, "users", normalizedEmail);
        const userDocSnap = await getDoc(userDocRef);
        const role = userDocSnap.exists()
          ? userDocSnap.data().role || "admin"
          : "admin";

        const anonRes = await signInAnonymously(auth);
        await updateProfile(anonRes.user, { displayName: "Admin" });

        localStorage.setItem("userEmail", normalizedEmail);
        localStorage.setItem("role", role);
        localStorage.removeItem("assignedWhiteboards");

        addMessage("success", "Welcome back! Redirecting to your dashboard...");
        navigate("/dashboard");
        return;
      }

      // Doc ID is the lowercase email, so this is a direct, cheap lookup
      // (and lets Firestore rules allow single-doc "get" without opening
      // up collection-wide "list" access to the whole users collection).
      const userDocRef = doc(db, "users", normalizedEmail);
      const userDocSnap = await getDoc(userDocRef);

      if (!userDocSnap.exists()) {
        addMessage("danger", "No account found for this email.");
        return;
      }

      setConfirmedUserData(userDocSnap.data());
      setPrimaryEmail(normalizedEmail);
      setStep("confirm");
    } catch (err) {
      console.error("Email lookup failed:", err);
      addMessage("danger", "Something went wrong. Please try again.");
    } finally {
      setPrimarySubmitting(false);
    }
  };

  // Step 2: confirm it's really them by matching their Participant ID
  // against what's on file, then send them forward to their whiteboard(s).
  const handleConfirmSubmit = async (e) => {
    e.preventDefault();

    const pid = primaryParticipantId.trim();
    if (!pid) {
      addMessage("danger", "Please enter your Participant ID.");
      return;
    }

    if (!confirmedUserData) {
      addMessage("danger", "Something went wrong. Please start over.");
      resetToEmailStep();
      return;
    }

    setPrimarySubmitting(true);

    try {
      // Validate the Participant ID against what's on file, rather than
      // trusting whatever was typed in. Case-insensitive to be forgiving
      // of "p014" vs "P014".
      const storedPid = (confirmedUserData.participantId || "")
        .trim()
        .toUpperCase();
      if (storedPid && storedPid !== pid.toUpperCase()) {
        addMessage(
          "danger",
          "Email and Participant ID don't match our records."
        );
        return;
      }

      const rawAssignments = confirmedUserData.assignment;
      const assignments = Array.isArray(rawAssignments) ? rawAssignments : [];

      if (assignments.length === 0) {
        addMessage("danger", "No team assignments found for this participant.");
        return;
      }

      // Sign in anonymously up front, regardless of how many assignments
      // this participant has. DashboardRouter (and any other page gated on
      // auth state) needs a real Firebase user to exist — if we skip this
      // for the multi-assignment case, onAuthStateChanged fires with
      // user = null and the dashboard shows "No user logged in", even
      // though we already set the right values in localStorage.
      const anonRes = await signInAnonymously(auth);
      const uid = anonRes.user.uid;

      await updateProfile(anonRes.user, {
        displayName: pid,
      });

      // Persist the confirmed Participant ID so it can be threaded through
      // userContext everywhere shapes/comments/export_buffer moves get
      // written (see utils/identity.js -> getActorIdentity()). This is the
      // real identifier for the person taking actions on the canvas, not
      // the anonymous Firebase uid. "userDisplayName" is kept as a legacy
      // alias for any older code paths still reading that key.
      localStorage.setItem("participantId", pid);
      localStorage.setItem("userDisplayName", pid);
      localStorage.setItem("userEmail", primaryEmail);

      if (assignments.length === 1) {
        const a = assignments[0];

        await setDoc(doc(db, "participantSessions", uid), {
          uid,
          email: primaryEmail,
          participantId: pid,
          role: confirmedUserData.role || "participant",
          studyId: a.studyId,
          taskName: a.taskName,
          teamId: a.teamId,
          createdAt: serverTimestamp(),
        });

        addMessage("success", "Welcome! Redirecting to your whiteboard...");

        navigate(
          `/whiteboard/${encodeURIComponent(a.studyId)}/${encodeURIComponent(
            a.taskName
          )}/${encodeURIComponent(a.teamId)}`
        );
        return;
      }

      // Multiple assignments (e.g. participant is in more than one
      // session/condition): let them choose from a dashboard instead of
      // guessing which one they meant to join. Still write a session doc
      // (without a single studyId/taskName/teamId) so there's an audit
      // trail of the login itself.
      await setDoc(doc(db, "participantSessions", uid), {
        uid,
        email: primaryEmail,
        participantId: pid,
        role: confirmedUserData.role || "participant",
        createdAt: serverTimestamp(),
      });

      const assignedWhiteboards = await Promise.all(
        assignments.map(async (a) => {
          const classId = a.studyId || "";
          const classSnap = await getDoc(doc(db, "classrooms", classId));
          const classData = classSnap.exists() ? classSnap.data() : {};

          return {
            classId,
            className: classId,
            classDisplayName: classData.class_name || classId,
            courseID: classData.courseID || classId,
            semester: classData.semester || "",
            teacherEmail: classData.teacherEmail || "",
            projectName: a.taskName || "",
            teamName: a.teamId || "",
          };
        })
      );

      localStorage.setItem("userEmail", primaryEmail);
      localStorage.setItem("role", "participant");
      localStorage.setItem(
        "assignedWhiteboards",
        JSON.stringify(assignedWhiteboards)
      );

      addMessage("success", "Welcome! Please choose your assigned board.");
      navigate("/dashboard");
    } catch (err) {
      console.error("Participant confirm login failed:", err);
      addMessage("danger", "Login failed. Please try again.");
    } finally {
      setPrimarySubmitting(false);
    }
  };

  const handleProfileAndRedirect = async (user) => {
    const userEmail = (user.email || "").trim().toLowerCase();

    try {
      const userDocRef = doc(db, "users", userEmail);
      const userDocSnap = await getDoc(userDocRef);

      if (!userDocSnap.exists()) {
        addMessage(
          "danger",
          "Your account is not registered in the system. Please contact the instructor."
        );
        return;
      }

      const userData = userDocSnap.data();
      const role = userData.role || "";

      localStorage.setItem("userEmail", userEmail);
      localStorage.setItem("role", role);
      localStorage.removeItem("assignedWhiteboards");

      if (role === "teacher" || role === "admin") {
        addMessage("success", "Welcome! Redirecting to your dashboard.");
        navigate("/dashboard");
        return;
      }

      if (role === "student") {
        const classroomsRef = collection(db, "classrooms");
        const classroomsSnap = await getDocs(classroomsRef);

        const assignedWhiteboards = [];

        for (const classroomDoc of classroomsSnap.docs) {
          const classId = classroomDoc.id;
          const classroomData = classroomDoc.data();

          const projectsRef = collection(db, "classrooms", classId, "Projects");
          const projectsSnap = await getDocs(projectsRef);

          for (const projectDoc of projectsSnap.docs) {
            const projectId = projectDoc.id;
            const projectData = projectDoc.data();

            const teamsRef = collection(
              db,
              "classrooms",
              classId,
              "Projects",
              projectId,
              "teams"
            );
            const teamsSnap = await getDocs(teamsRef);

            for (const teamDoc of teamsSnap.docs) {
              const teamData = teamDoc.data();

              const memberEmails = Object.keys(teamData)
                .filter((key) => key !== "previewUrl")
                .map((email) => email.trim().toLowerCase());

              if (memberEmails.includes(userEmail)) {
                assignedWhiteboards.push({
                  classId,
                  className: classId,
                  classDisplayName: classroomData.class_name || classId,
                  courseID: classroomData.courseID || classId,
                  semester: classroomData.semester || "",
                  teacherEmail: classroomData.teacherEmail || "",
                  projectName: projectData.projectName || projectId,
                  teamName: teamDoc.id,
                });
              }
            }
          }
        }

        if (assignedWhiteboards.length === 0) {
          addMessage("danger", "You are not assigned to any whiteboards.");
          return;
        }

        localStorage.setItem(
          "assignedWhiteboards",
          JSON.stringify(assignedWhiteboards)
        );

        addMessage("success", "Welcome! Redirecting to your dashboard.");
        navigate("/dashboard");
        return;
      }

      addMessage("danger", "Your account role is not recognized.");
    } catch (err) {
      console.error("Error during login redirect:", err);
      addMessage("danger", "Could not load your dashboard.");
    }
  };

  const googleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      await handleProfileAndRedirect(result.user);
    } catch (error) {
      console.error("Google login failed:", error);
      addMessage("danger", "Google login failed. Please try again.");
    }
  };

  const emailPasswordLogin = async (e) => {
    e.preventDefault();
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      await handleProfileAndRedirect(result.user);
    } catch (error) {
      console.error("Email/password login failed:", error);

      let msg = "Login failed. Please check your email and password.";
      if (error.code === "auth/user-not-found") {
        msg = "No account found for this email.";
      } else if (error.code === "auth/wrong-password") {
        msg = "Incorrect password. Please try again.";
      } else if (error.code === "auth/invalid-email") {
        msg = "Please enter a valid email address.";
      }

      addMessage("danger", msg);
    }
  };

  const renderDeveloperAccessLink = () => (
    <div className="mt-3">
      <a href={accessMailto} className="btn btn-link p-0 text-decoration-none">
        Email the developer for access
      </a>
    </div>
  );

  return (
    <div
      className="d-flex justify-content-center align-items-center min-vh-100"
      style={{
        backgroundImage: 'url("/body-bg3.png")',
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="login-container p-4 bg-white rounded shadow text-center">
        <h2
          className="mb-4"
          style={{ fontWeight: 700, fontSize: "28px", color: "#333" }}
        >
          Welcome to PolyFlux
        </h2>
        <img
          src="/logo.png"
          alt="App logo"
          style={{ width: "150px", marginBottom: "20px" }}
        />

        <p className="mb-4 text-muted">Collaborate. Create. Reflect.</p>

        {/* Local flash messages (if you still use `message` state here) */}
        {message && (
          <div
            className={`alert ${
              message.includes("failed") ? "alert-danger" : "alert-info"
            }`}
            role="alert"
          >
            <strong>{message}</strong>
          </div>
        )}

        {/* If we arrived via a personalized study link, let them know and
            offer a way to back out if it isn't them. */}
        {prefilledFromLink && step === "confirm" && (
          <div className="alert alert-info text-start" role="alert">
            Signed in as <strong>{primaryEmail}</strong>. Not you?{" "}
            <button
              type="button"
              className="btn btn-link p-0 align-baseline"
              onClick={resetToEmailStep}
            >
              Clear
            </button>
          </div>
        )}

        {/* Primary flow, step 1: just an email box. */}
        {step === "email" && (
          <form onSubmit={handleEmailContinue}>
            <div className="mb-3 text-start">
              <label className="form-label mb-1">Email</label>
              <input
                type="email"
                className="form-control"
                placeholder="yourname@lsu.edu"
                value={primaryEmail}
                onChange={(e) => setPrimaryEmail(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-dark w-100"
              disabled={primarySubmitting}
            >
              {primarySubmitting ? "Checking..." : "Continue"}
            </button>
          </form>
        )}

        {/* Primary flow, step 2: confirm identity with Participant ID. */}
        {step === "confirm" && (
          <form onSubmit={handleConfirmSubmit}>
            <p className="text-muted text-start mb-2">
              Confirm it's you — enter your Participant ID for{" "}
              <strong>{primaryEmail}</strong>.
            </p>

            <div className="mb-3 text-start">
              <label className="form-label mb-1">Participant ID</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g., P014"
                value={primaryParticipantId}
                onChange={(e) => setPrimaryParticipantId(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className="btn btn-dark w-100"
              disabled={primarySubmitting}
            >
              {primarySubmitting ? "Signing in..." : "Confirm & Continue"}
            </button>

            <button
              type="button"
              className="btn btn-link mt-2 p-0"
              onClick={resetToEmailStep}
            >
              Use a different email
            </button>
          </form>
        )}

        {/* Bottom links to the alternate sign-in methods. */}
        <div className="mt-4 d-flex justify-content-center align-items-center gap-2">
          <button
            type="button"
            className="btn btn-link p-0 text-decoration-none"
            onClick={() => setShowEmailForm((v) => !v)}
          >
            Sign in with LSU ID
          </button>
          <span className="text-muted">|</span>
          <button
            type="button"
            className="btn btn-link p-0 text-decoration-none"
            onClick={googleLogin}
          >
            Sign in with Google
          </button>
        </div>

        {/* LSU ID (email/password) login: only visible after clicking the link. */}
        {showEmailForm && (
          <>
            <div className="d-flex align-items-center my-3">
              <hr className="flex-grow-1" />
              <span className="mx-2 text-muted">LSU ID sign in</span>
              <hr className="flex-grow-1" />
            </div>
            <form onSubmit={emailPasswordLogin}>
              <div className="mb-2 text-start">
                <label className="form-label mb-1">Email</label>
                <input
                  type="email"
                  className="form-control"
                  placeholder="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="mb-3 text-start">
                <label className="form-label mb-1">Password</label>
                <input
                  type="password"
                  className="form-control"
                  placeholder="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <button type="submit" className="btn btn-primary w-100">
                Login with LSU ID
              </button>
            </form>
            {renderDeveloperAccessLink()}
          </>
        )}
      </div>
    </div>
  );
};

export default LoginPage;
