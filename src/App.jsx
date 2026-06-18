import { useState } from "react";
import {
  X, Scale, Lock, Ban, ShieldCheck, Euro, Clock, Percent,
  FileText, Send, Building2
} from "lucide-react";
import Logo from "./Logo.jsx";
import EligibilityChecker from "./EligibilityChecker.jsx";
import ClaimGuide from "./ClaimGuide.jsx";
import BaggageHelper from "./BaggageHelper.jsx";

/* ---- Desktop-only side panels. Hidden below lg so mobile is untouched. ---- */

function SidePanelLeft() {
  const stats = [
    [Euro, "\u20AC600", "Max compensation per passenger"],
    [Clock, "3 hrs", "Delay threshold to claim under EU261"],
    [Percent, "0%", "Commission \u2014 you keep all of it"],
  ];
  const trust = [
    [Scale, "Grounded in law", "EU261, UK261 & Montreal Convention"],
    [Lock, "Nothing stored", "Everything stays in your browser"],
    [Ban, "No airline ties", "Independent and impartial"],
    [ShieldCheck, "Free to use", "Keep 100% of what you claim"],
  ];
  return (
    <aside className="hidden lg:flex flex-col gap-4 w-72 shrink-0 pt-4">
      <div className="bg-[#0B2545] rounded-2xl p-5 text-white">
        <div className="text-[11px] font-bold uppercase tracking-wider text-teal-300 mb-4">
          What you could be owed
        </div>
        <div className="space-y-4">