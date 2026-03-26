import * as XLSX from "xlsx";
import type { QuestionType } from "@/types/domain";

export function downloadQuestionTemplate(type: QuestionType) {
    const headersByType: Record<string, string[]> = {
        mcq: ["question_text", "option_a", "option_b", "option_c", "option_d", "correct_answer", "difficulty", "bloom_level (optional)", "question_level"],
        true_false: ["question_text", "correct_answer", "difficulty", "bloom_level (optional)", "question_level"],
        fill_blanks: ["question_text", "correct_answer", "difficulty", "bloom_level (optional)", "question_level"],
        short: ["question_text", "difficulty", "bloom_level (optional)", "question_level"],
        long: ["question_text", "difficulty", "bloom_level (optional)", "question_level"],
        matching: ["question_text", "correct_answer", "difficulty", "bloom_level (optional)", "question_level"],
        diagram: ["question_text", "diagram_url", "difficulty", "bloom_level (optional)", "question_level"],
    };

    const bloomKey = "bloom_level (optional)";

    const sampleDataByType: Record<string, any[]> = {
        mcq: [{
            question_text: "What is the capital of Pakistan? || پاکستان کا دارالحکومت کیا ہے؟",
            option_a: "Karachi || کراچی",
            option_b: "Lahore || لاہور",
            option_c: "Islamabad || اسلام آباد",
            option_d: "Peshawar || پشاور",
            correct_answer: "C",
            difficulty: "easy",
            [bloomKey]: "remember",
            question_level: "exercise"
        }],
        true_false: [{
            question_text: "The sun rises in the east. || سورج مشرق سے نکلتا ہے۔",
            correct_answer: "True || درست",
            difficulty: "easy",
            [bloomKey]: "remember",
            question_level: "exercise"
        }],
        fill_blanks: [{
            question_text: "Water freezes at ___ degrees Celsius. || پانی ___ ڈگری سیلسیس پر جم جاتا ہے۔",
            correct_answer: "0 || 0",
            difficulty: "easy",
            [bloomKey]: "remember",
            question_level: "exercise"
        }],
        short: [{
            question_text: "Briefly explain Newton's first law. || نیوٹن کے پہلے قانون کی مختصر وضاحت کریں۔",
            difficulty: "medium",
            [bloomKey]: "understand",
            question_level: "exercise"
        }],
        long: [{
            question_text: "Discuss the impact of climate change on agriculture. || موسمیاتی تبدیلی کے زراعت پر اثرات بیان کریں۔",
            difficulty: "hard",
            [bloomKey]: "evaluate",
            question_level: "additional"
        }],
        matching: [{
            question_text: "A-2;B-3;C-1 || A-2؛B-3؛C-1",
            correct_answer: "A-Apple;B-Banana;C-Cherry || A-سیب؛B-کیلا؛C-چیری",
            difficulty: "medium",
            [bloomKey]: "apply",
            question_level: "past_papers"
        }],
        diagram: [{
            question_text: "Identify the parts of the human heart. || انسانی دل کے حصے پہچانیں۔",
            diagram_url: "https://example.com/heart-diagram.png",
            difficulty: "hard",
            [bloomKey]: "analyze",
            question_level: "conceptual"
        }],
    };

    const headers = headersByType[type] || headersByType.mcq;
    const sample = sampleDataByType[type] || sampleDataByType.mcq;

    const worksheet = XLSX.utils.json_to_sheet(sample, { header: headers });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Template");

    XLSX.writeFile(workbook, `${type}_template.xlsx`);
}
