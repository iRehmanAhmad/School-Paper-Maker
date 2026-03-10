import { useEffect, useMemo, useState } from "react";
import { Bar, Doughnut, Line } from "react-chartjs-2";
import { ArcElement, BarElement, CategoryScale, Chart as ChartJS, Legend, LinearScale, LineElement, PointElement, Tooltip } from "chart.js";
import jsPDF from "jspdf";
import * as XLSX from "xlsx";
import { getChapters, getClasses, getPapersByTeacher, getQuestions, getSubjects } from "@/services/repositories";
import { useAppStore } from "@/store/useAppStore";
import type { ChapterEntity, Paper, Question, QuestionType, SubjectEntity } from "@/types/domain";

ChartJS.register(ArcElement, BarElement, Tooltip, Legend, CategoryScale, LinearScale, LineElement, PointElement);

const analyticsTypes: QuestionType[] = ["mcq", "true_false", "fill_blanks", "short", "long", "matching", "diagram"];
const bloomsOrder = ["remember", "understand", "apply", "analyze", "evaluate", "unassigned"];

type DateFilterMode = "all" | "month" | "quarter" | "custom";

function monthKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${date.getFullYear()}-${month}`;
}

function quarterKey(date: Date) {
  const quarter = Math.floor(date.getMonth() / 3) + 1;
  return `${date.getFullYear()}-Q${quarter}`;
}

function quarterLabel(key: string) {
  const [year, quarter] = key.split("-");
  return `${quarter} ${year}`;
}

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function parseDateSafe(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function healthBand(score: number) {
  if (score >= 75) return { label: "Healthy", className: "text-emerald-700 bg-emerald-50" };
  if (score >= 45) return { label: "Moderate", className: "text-amber-700 bg-amber-50" };
  return { label: "At Risk", className: "text-red-700 bg-red-50" };
}

export function AnalyticsPage() {
  const profile = useAppStore((s) => s.profile);
  const toast = useAppStore((s) => s.pushToast);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [subjects, setSubjects] = useState<SubjectEntity[]>([]);
  const [chapters, setChapters] = useState<ChapterEntity[]>([]);

  const [selectedSubjectId, setSelectedSubjectId] = useState<"all" | string>("all");
  const [dateFilterMode, setDateFilterMode] = useState<DateFilterMode>("month");
  const [selectedMonth, setSelectedMonth] = useState(monthKey(new Date()));
  const [selectedQuarter, setSelectedQuarter] = useState(quarterKey(new Date()));
  const [customStartDate, setCustomStartDate] = useState(toDateInputValue(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [customEndDate, setCustomEndDate] = useState(toDateInputValue(new Date()));

  useEffect(() => {
    async function load() {
      if (!profile?.school_id || !profile.id) return;

      try {
        const classes = await getClasses(profile.school_id);
        const [allSubjects, allQuestions, teacherPapers] = await Promise.all([
          getSubjects(classes.map((item) => item.id)),
          getQuestions(profile.school_id),
          getPapersByTeacher(profile.id),
        ]);
        const allChapters = await getChapters(allSubjects.map((item) => item.id));

        setSubjects(allSubjects);
        setChapters(allChapters);
        setQuestions(allQuestions);
        setPapers(teacherPapers);
      } catch (error) {
        toast("error", "Failed to load analytics data");
      }
    }

    load();
  }, [profile?.id, profile?.school_id]);

  const chapterById = useMemo(
    () => Object.fromEntries(chapters.map((chapter) => [chapter.id, chapter])),
    [chapters]
  );
  const subjectById = useMemo(
    () => Object.fromEntries(subjects.map((subject) => [subject.id, subject])),
    [subjects]
  );

  const quarterOptions = useMemo(() => {
    const keys = Array.from(
      new Set(
        papers
          .map((paper) => parseDateSafe(paper.created_at))
          .filter((value): value is Date => value !== null)
          .map((date) => quarterKey(date))
      )
    ).sort((a, b) => b.localeCompare(a));
    return keys;
  }, [papers]);

  useEffect(() => {
    if (!quarterOptions.length) return;
    if (!quarterOptions.includes(selectedQuarter)) {
      setSelectedQuarter(quarterOptions[0]);
    }
  }, [quarterOptions, selectedQuarter]);

  const filteredQuestions = useMemo(() => {
    if (selectedSubjectId === "all") return questions;
    return questions.filter((question) => chapterById[question.chapter_id]?.subject_id === selectedSubjectId);
  }, [questions, selectedSubjectId, chapterById]);

  const visibleChapters = useMemo(() => {
    if (selectedSubjectId === "all") return chapters;
    return chapters.filter((chapter) => chapter.subject_id === selectedSubjectId);
  }, [chapters, selectedSubjectId]);

  function isPaperInDateRange(paper: Paper) {
    const paperDate = parseDateSafe(paper.created_at);
    if (!paperDate) return false;

    if (dateFilterMode === "all") return true;
    if (dateFilterMode === "month") return monthKey(paperDate) === selectedMonth;
    if (dateFilterMode === "quarter") return quarterKey(paperDate) === selectedQuarter;

    const start = parseDateSafe(customStartDate);
    const end = parseDateSafe(customEndDate);
    if (!start && !end) return true;
    if (start && paperDate < start) return false;
    if (end) {
      const endWithDay = new Date(end);
      endWithDay.setHours(23, 59, 59, 999);
      if (paperDate > endWithDay) return false;
    }
    return true;
  }

  const filteredPapers = useMemo(() => papers.filter((paper) => isPaperInDateRange(paper)), [papers, dateFilterMode, selectedMonth, selectedQuarter, customStartDate, customEndDate]);

  const paperTrendEntries = useMemo(() => {
    const trend: Record<string, number> = {};
    filteredPapers.forEach((paper) => {
      const paperDate = parseDateSafe(paper.created_at);
      if (!paperDate) return;
      const key = paperDate.toISOString().slice(0, 10);
      trend[key] = (trend[key] ?? 0) + 1;
    });
    return Object.entries(trend).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredPapers]);

  const chapterStats = useMemo(() => {
    return visibleChapters.map((chapter) => {
      const chapterQuestions = filteredQuestions.filter((question) => question.chapter_id === chapter.id);
      const types: Record<string, number> = {};
      chapterQuestions.forEach((question) => {
        types[question.question_type] = (types[question.question_type] || 0) + 1;
      });
      return {
        id: chapter.id,
        title: chapter.title,
        count: chapterQuestions.length,
        types,
      };
    });
  }, [visibleChapters, filteredQuestions]);

  const alerts = useMemo(() => chapterStats.filter((chapter) => chapter.count < 5), [chapterStats]);

  const subjectHealthRows = useMemo(() => {
    const visibleSubjects = selectedSubjectId === "all" ? subjects : subjects.filter((subject) => subject.id === selectedSubjectId);

    return visibleSubjects
      .map((subject) => {
        const subjectChapterIds = chapters.filter((chapter) => chapter.subject_id === subject.id).map((chapter) => chapter.id);
        const chapterIdSet = new Set(subjectChapterIds);
        const subjectQuestions = questions.filter((question) => chapterIdSet.has(question.chapter_id));

        const typeCounts = analyticsTypes.reduce((acc, type) => {
          acc[type] = 0;
          return acc;
        }, {} as Record<QuestionType, number>);
        subjectQuestions.forEach((question) => {
          typeCounts[question.question_type] = (typeCounts[question.question_type] || 0) + 1;
        });

        const totalQuestions = subjectQuestions.length;
        const typesWithMinimumCoverage = analyticsTypes.filter((type) => typeCounts[type] >= 3).length;
        const typeCoverageScore = analyticsTypes.length ? (typesWithMinimumCoverage / analyticsTypes.length) * 100 : 0;
        const volumeScore = Math.min(100, (totalQuestions / 80) * 100);

        const balanceScore = (() => {
          if (!totalQuestions) return 0;
          const expectedPerType = totalQuestions / analyticsTypes.length;
          const deviation = analyticsTypes.reduce((acc, type) => acc + Math.abs(typeCounts[type] - expectedPerType), 0) / (2 * totalQuestions);
          return Math.max(0, 100 * (1 - deviation));
        })();

        const healthScore = clampScore(volumeScore * 0.5 + typeCoverageScore * 0.3 + balanceScore * 0.2);

        return {
          id: subject.id,
          name: subject.name,
          totalQuestions,
          typeCoverageScore: clampScore(typeCoverageScore),
          volumeScore: clampScore(volumeScore),
          balanceScore: clampScore(balanceScore),
          healthScore,
        };
      })
      .sort((a, b) => b.healthScore - a.healthScore);
  }, [subjects, chapters, questions, selectedSubjectId]);

  const averageHealthScore = useMemo(() => {
    if (!subjectHealthRows.length) return 0;
    return clampScore(subjectHealthRows.reduce((acc, row) => acc + row.healthScore, 0) / subjectHealthRows.length);
  }, [subjectHealthRows]);

  const diffMix = useMemo(() => {
    const counts = { easy: 0, medium: 0, hard: 0 };
    filteredQuestions.forEach((question) => {
      counts[question.difficulty] += 1;
    });
    return {
      labels: ["Easy", "Medium", "Hard"],
      datasets: [{ data: [counts.easy, counts.medium, counts.hard], backgroundColor: ["#10b981", "#f59e0b", "#ef4444"] }],
    };
  }, [filteredQuestions]);

  const bloomMix = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredQuestions.forEach((question) => {
      const key = question.bloom_level || "unassigned";
      counts[key] = (counts[key] || 0) + 1;
    });
    const labels = bloomsOrder.filter((item) => (counts[item] || 0) > 0);
    return {
      labels,
      datasets: [{ data: labels.map((label) => counts[label]), backgroundColor: ["#6366f1", "#8b5cf6", "#d946ef", "#f43f5e", "#fb923c", "#94a3b8"] }],
    };
  }, [filteredQuestions]);

  const typeMix = useMemo(() => {
    const counts = analyticsTypes.reduce((acc, type) => {
      acc[type] = 0;
      return acc;
    }, {} as Record<QuestionType, number>);
    filteredQuestions.forEach((question) => {
      counts[question.question_type] += 1;
    });
    return {
      labels: analyticsTypes.map((type) => type.replace("_", " ")),
      datasets: [{ label: "Questions", data: analyticsTypes.map((type) => counts[type]), backgroundColor: "#0f6f8f" }],
    };
  }, [filteredQuestions]);

  const lineData = useMemo(
    () => ({
      labels: paperTrendEntries.map(([label]) => label),
      datasets: [{ label: "Papers generated", data: paperTrendEntries.map(([, value]) => value), borderColor: "#0f6f8f", backgroundColor: "rgba(15,111,143,0.1)", fill: true, tension: 0.35 }],
    }),
    [paperTrendEntries]
  );

  function exportAnalyticsExcel() {
    const summaryRows = [
      { metric: "Subject Filter", value: selectedSubjectId === "all" ? "All Subjects" : subjectById[selectedSubjectId]?.name || "Unknown" },
      { metric: "Date Filter", value: dateFilterMode === "all" ? "All Time" : dateFilterMode === "month" ? selectedMonth : dateFilterMode === "quarter" ? quarterLabel(selectedQuarter) : `${customStartDate} to ${customEndDate}` },
      { metric: "Questions in scope", value: filteredQuestions.length },
      { metric: "Papers in velocity scope", value: filteredPapers.length },
      { metric: "Average inventory health", value: averageHealthScore },
    ];

    const chapterRows = chapterStats.map((chapter) => ({
      chapter: chapter.title,
      subject: subjectById[chapterById[chapter.id]?.subject_id || ""]?.name || "Unknown",
      total: chapter.count,
      mcq: chapter.types.mcq || 0,
      true_false: chapter.types.true_false || 0,
      fill_blanks: chapter.types.fill_blanks || 0,
      short: chapter.types.short || 0,
      long: chapter.types.long || 0,
      matching: chapter.types.matching || 0,
      diagram: chapter.types.diagram || 0,
    }));

    const healthRows = subjectHealthRows.map((row) => ({
      subject: row.name,
      total_questions: row.totalQuestions,
      volume_score: row.volumeScore,
      type_coverage_score: row.typeCoverageScore,
      balance_score: row.balanceScore,
      health_score: row.healthScore,
    }));

    const trendRows = paperTrendEntries.map(([date, count]) => ({ date, papers_generated: count }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summaryRows), "Summary");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(chapterRows), "Chapter Coverage");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(healthRows), "Subject Health");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(trendRows), "Paper Velocity");

    XLSX.writeFile(workbook, `analytics-export-${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast("success", "Analytics exported as Excel");
  }

  function exportAnalyticsPdf() {
    const doc = new jsPDF();
    let y = 14;
    const pageWidth = doc.internal.pageSize.getWidth();

    const line = (text: string) => {
      if (y > 280) {
        doc.addPage();
        y = 14;
      }
      doc.text(text, 14, y);
      y += 6;
    };

    doc.setFontSize(14);
    doc.text("Paper Generator - Analytics Report", 14, y);
    y += 8;

    doc.setFontSize(10);
    line(`Generated on: ${new Date().toLocaleString()}`);
    line(`Subject Filter: ${selectedSubjectId === "all" ? "All Subjects" : subjectById[selectedSubjectId]?.name || "Unknown"}`);
    line(`Date Filter: ${dateFilterMode === "all" ? "All Time" : dateFilterMode === "month" ? selectedMonth : dateFilterMode === "quarter" ? quarterLabel(selectedQuarter) : `${customStartDate} to ${customEndDate}`}`);
    y += 2;
    line(`Questions in scope: ${filteredQuestions.length}`);
    line(`Papers in velocity scope: ${filteredPapers.length}`);
    line(`Average inventory health: ${averageHealthScore}/100`);

    y += 4;
    doc.setFontSize(11);
    line("Top Subject Health Scores:");
    doc.setFontSize(10);
    subjectHealthRows.slice(0, 8).forEach((row, index) => {
      line(`${index + 1}. ${row.name} - ${row.healthScore}/100 (${row.totalQuestions} questions)`);
    });

    y += 4;
    doc.setFontSize(11);
    line("Chapter Alerts (count < 5):");
    doc.setFontSize(10);
    if (!alerts.length) {
      line("No low inventory alerts.");
    } else {
      alerts.slice(0, 12).forEach((alert, index) => {
        line(`${index + 1}. ${alert.title}: ${alert.count}`);
      });
    }

    y += 4;
    doc.setFontSize(11);
    line("Paper Velocity:");
    doc.setFontSize(10);
    if (!paperTrendEntries.length) {
      line("No papers found in selected date range.");
    } else {
      paperTrendEntries.slice(0, 20).forEach(([date, count]) => {
        line(`${date} - ${count}`);
      });
      if (paperTrendEntries.length > 20) {
        line(`... and ${paperTrendEntries.length - 20} more rows`);
      }
    }

    doc.save(`analytics-export-${new Date().toISOString().slice(0, 10)}.pdf`);
    toast("success", "Analytics exported as PDF");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold">Content Intelligence</h2>
          <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Questions in scope: {filteredQuestions.length}
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs font-semibold text-slate-600">
            Subject Drill-down
            <select
              className="mt-1 w-56 rounded-lg border border-slate-300 px-3 py-2"
              value={selectedSubjectId}
              onChange={(event) => setSelectedSubjectId(event.target.value)}
            >
              <option value="all">All Subjects</option>
              {subjects
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
            </select>
          </label>
          <button
            type="button"
            onClick={exportAnalyticsPdf}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:border-brand hover:text-brand"
          >
            Export PDF
          </button>
          <button
            type="button"
            onClick={exportAnalyticsExcel}
            className="rounded-lg bg-brand px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-brand/90"
          >
            Export Excel
          </button>
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="flex items-center gap-2 text-sm font-bold text-amber-800">
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            Inventory Alerts (Low Question Count)
          </h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {alerts.slice(0, 8).map((alert) => (
              <span key={alert.id} className="rounded-full bg-white px-3 py-1 text-[10px] font-bold text-amber-700 shadow-sm">
                {alert.title}: {alert.count}
              </span>
            ))}
            {alerts.length > 8 && <span className="text-xs text-amber-600">+{alerts.length - 8} more</span>}
          </div>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-4 text-xs font-bold uppercase text-slate-500">Difficulty Distribution</h3>
          <div className="aspect-square">
            <Doughnut data={diffMix} options={{ cutout: "70%", plugins: { legend: { position: "bottom" } } }} />
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-4 text-xs font-bold uppercase text-slate-500">Bloom's Taxonomy</h3>
          <div className="aspect-square">
            <Doughnut data={bloomMix} options={{ cutout: "70%", plugins: { legend: { position: "bottom" } } }} />
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="mb-4 text-xs font-bold uppercase text-slate-500">Question Types</h3>
          <Bar data={typeMix} options={{ plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { display: false } } } }} />
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase text-slate-500">Inventory Health Score</h3>
            <p className="text-xs text-slate-400">Coverage score (0-100) based on volume and type distribution</p>
          </div>
          <div className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700">
            Average: {averageHealthScore}/100
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="pb-3 pr-4 font-bold text-slate-600">Subject</th>
                <th className="pb-3 text-center font-bold text-slate-600">Questions</th>
                <th className="pb-3 text-center font-bold text-slate-600">Volume</th>
                <th className="pb-3 text-center font-bold text-slate-600">Type Coverage</th>
                <th className="pb-3 text-center font-bold text-slate-600">Balance</th>
                <th className="pb-3 text-right font-bold text-slate-600">Health</th>
              </tr>
            </thead>
            <tbody>
              {subjectHealthRows.map((row) => {
                const band = healthBand(row.healthScore);
                return (
                  <tr key={row.id} className="border-b border-slate-50">
                    <td className="py-3 pr-4 font-semibold text-slate-700">{row.name}</td>
                    <td className="py-3 text-center font-bold text-slate-700">{row.totalQuestions}</td>
                    <td className="py-3 text-center">{row.volumeScore}</td>
                    <td className="py-3 text-center">{row.typeCoverageScore}</td>
                    <td className="py-3 text-center">{row.balanceScore}</td>
                    <td className="py-3 text-right">
                      <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-bold ${band.className}`}>
                        {row.healthScore} - {band.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {subjectHealthRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-500">No subject health data available.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase text-slate-500">Inventory Coverage Heatmap</h3>
            <p className="text-xs text-slate-400">Question distribution across chapters and types</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="pb-3 pr-4 font-bold text-slate-600">Chapter Title</th>
                {analyticsTypes.map((type) => (
                  <th key={type} className="pb-3 text-center font-bold text-slate-600 capitalize">{type.replace("_", " ")}</th>
                ))}
                <th className="pb-3 text-right font-bold text-slate-600">Total</th>
              </tr>
            </thead>
            <tbody>
              {chapterStats.map((chapter) => (
                <tr key={chapter.id} className="border-b border-slate-50 transition-colors hover:bg-slate-50/50">
                  <td className="py-3 pr-4 font-medium text-slate-700">
                    {chapter.title}
                    <span className="ml-2 text-[10px] text-slate-400">({subjectById[chapterById[chapter.id]?.subject_id || ""]?.name || "Unknown"})</span>
                  </td>
                  {analyticsTypes.map((type) => {
                    const count = chapter.types[type] || 0;
                    return (
                      <td key={type} className="py-2 text-center">
                        <div
                          className={`mx-auto flex h-8 w-8 items-center justify-center rounded-lg font-bold transition-all ${
                            count === 0
                              ? "border border-red-100 bg-red-50 text-red-400"
                              : count < 5
                                ? "border border-amber-100 bg-amber-50 text-amber-600"
                                : "border border-brand/20 bg-brand/10 text-brand shadow-sm"
                          }`}
                        >
                          {count}
                        </div>
                      </td>
                    );
                  })}
                  <td className="py-3 text-right font-bold text-slate-900">{chapter.count}</td>
                </tr>
              ))}
              {chapterStats.length === 0 && (
                <tr>
                  <td colSpan={analyticsTypes.length + 2} className="py-6 text-center text-slate-500">No chapter coverage data available.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-xs font-bold uppercase text-slate-500">Paper Generation Velocity</h3>
            <p className="text-xs text-slate-400">Filtered by selected date range</p>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs font-semibold text-slate-600">
              Range
              <select
                className="mt-1 rounded-lg border border-slate-300 px-3 py-2"
                value={dateFilterMode}
                onChange={(event) => setDateFilterMode(event.target.value as DateFilterMode)}
              >
                <option value="month">Month</option>
                <option value="quarter">Quarter</option>
                <option value="custom">Custom</option>
                <option value="all">All Time</option>
              </select>
            </label>

            {dateFilterMode === "month" && (
              <label className="text-xs font-semibold text-slate-600">
                Month
                <input
                  className="mt-1 rounded-lg border border-slate-300 px-3 py-2"
                  type="month"
                  value={selectedMonth}
                  onChange={(event) => setSelectedMonth(event.target.value)}
                />
              </label>
            )}

            {dateFilterMode === "quarter" && (
              <label className="text-xs font-semibold text-slate-600">
                Quarter
                <select
                  className="mt-1 rounded-lg border border-slate-300 px-3 py-2"
                  value={selectedQuarter}
                  onChange={(event) => setSelectedQuarter(event.target.value)}
                >
                  {quarterOptions.length === 0 ? (
                    <option value={selectedQuarter}>{quarterLabel(selectedQuarter)}</option>
                  ) : (
                    quarterOptions.map((key) => (
                      <option key={key} value={key}>
                        {quarterLabel(key)}
                      </option>
                    ))
                  )}
                </select>
              </label>
            )}

            {dateFilterMode === "custom" && (
              <>
                <label className="text-xs font-semibold text-slate-600">
                  Start
                  <input
                    className="mt-1 rounded-lg border border-slate-300 px-3 py-2"
                    type="date"
                    value={customStartDate}
                    onChange={(event) => setCustomStartDate(event.target.value)}
                  />
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  End
                  <input
                    className="mt-1 rounded-lg border border-slate-300 px-3 py-2"
                    type="date"
                    value={customEndDate}
                    onChange={(event) => setCustomEndDate(event.target.value)}
                  />
                </label>
              </>
            )}
          </div>
        </div>
        <div className="h-64">
          <Line data={lineData} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true } } }} />
        </div>
      </div>
    </div>
  );
}
