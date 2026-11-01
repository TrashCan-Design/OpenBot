import { useEffect, useRef, useState } from "react";
import { useStore } from "@/state/store";
import { cornerPopupWaits, firstReplyPending } from "@/lib/corner-popup";
import { welcomeFinishedThisLaunch, type WelcomeViewer } from "@/lib/onboarding";
import { launchDialogShown, markLaunchDialog } from "@/lib/launch-dialogs";
import { SIMPLE_MODE_NOTICE, markLaunchNotice } from "@/lib/notices";
import { useSimpleModePromptSeen } from "@/lib/simple-mode-prompt";
import { useUpdaterState } from "@/lib/updater";
import { useOpenBotWelcomeDue } from "./OpenBotWelcome";
import { useOtherDialogOpen } from "./notice-dialogs";
import { reportSimpleModePrompt, SimpleModePrompt } from "./SimpleModePrompt";

/** Local interface prompt. Hosted plan, Boat, and third-party promotions have no entry point. */
export function AppNotices({ quiet = false, viewer = null }: {
  quiet?: boolean;
  viewer?: WelcomeViewer | null;
  now?: () => number;
}) {
  const { state } = useStore();
  const updater = useUpdaterState();
  const welcome = useOpenBotWelcomeDue(viewer);
  const due = !useSimpleModePromptSeen();
  const otherDialog = useOtherDialogOpen(due);
  const [closed, setClosed] = useState(false);
  const announced = useRef(false);
  const firstRun = welcomeFinishedThisLaunch() || launchDialogShown() === "mausbot" || firstReplyPending(state);
  const show = due && !closed && firstRun === false && !welcome.due && !otherDialog
    && !cornerPopupWaits(state, updater, { quiet, idle: true, viewer });

  useEffect(() => {
    if (!show || announced.current) return;
    announced.current = true;
    markLaunchNotice(SIMPLE_MODE_NOTICE);
    markLaunchDialog("notices");
    reportSimpleModePrompt("shown");
  }, [show]);

  return show ? <SimpleModePrompt onClose={() => setClosed(true)} /> : null;
}
