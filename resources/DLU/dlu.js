// 大连大学正方教务系统课表适配脚本

function parseWeeks(raw) {
    if (!raw) return [];
    const text = String(raw).replace(/\s+/g, "");
    const regex = /(\d+)(?:-(\d+))?周(?:\((单|双)\))?/g;
    const weeks = [];
    let match;

    while ((match = regex.exec(text)) !== null) {
        const start = Number(match[1]);
        const end = Number(match[2] || match[1]);
        const oddEven = match[3] || "";
        for (let w = start; w <= end; w++) {
            if (oddEven === "单" && w % 2 === 0) continue;
            if (oddEven === "双" && w % 2 !== 0) continue;
            weeks.push(w);
        }
    }

    return [...new Set(weeks)].sort((a, b) => a - b);
}

function parseSectionsFromText(raw) {
    if (!raw) return null;
    const text = String(raw).replace(/\s+/g, "");
    const match = text.match(/\(?(\d+)(?:-(\d+))?节\)?/);
    if (!match) return null;
    const startSection = Number(match[1]);
    const endSection = Number(match[2] || match[1]);
    if (Number.isNaN(startSection) || Number.isNaN(endSection) || startSection > endSection) return null;
    return { startSection, endSection };
}

function parseTableView() {
    const $ = window.jQuery;
    if (!$) return [];
    const courses = [];

    $("#kbgrid_table_0 td.td_wrap").each((_, td) => {
        const dayRaw = ($(td).attr("id") || "").split("-")[0];
        const day = Number(dayRaw);
        if (Number.isNaN(day) || day < 1 || day > 7) return;

        $(td).find(".timetable_con.text-left").each((__, course) => {
            const name = $(course).find(".title font").text().replace(/[●★○]/g, "").trim();
            const info = $(course).find("p").eq(0).find("font").eq(1).text().trim();
            const position = $(course).find("p").eq(1).find("font").text().trim();
            const teacher = $(course).find("p").eq(2).find("font").text().trim();

            const sectionInfo = parseSectionsFromText(info);
            const weeks = parseWeeks(info);
            if (!name || !teacher || !position || !sectionInfo || weeks.length === 0) return;

            courses.push({
                name: name,
                teacher: teacher,
                position: position.split(/\s+/).pop(),
                day: day,
                startSection: sectionInfo.startSection,
                endSection: sectionInfo.endSection,
                weeks: weeks
            });
        });
    });

    return courses;
}

function parseListView() {
    const $ = window.jQuery;
    if (!$) return [];
    const courses = [];

    $("#kblist_table tbody").each((day, tbody) => {
        if (day < 1 || day > 7) return;
        let currentSectionText = "";

        $(tbody).find("tr:not(:first-child)").each((_, tr) => {
            const cells = $(tr).find("td");
            let sectionText = currentSectionText;
            let infoCell;

            if (cells.length > 1) {
                sectionText = $(cells[0]).text().trim();
                currentSectionText = sectionText;
                infoCell = $(cells[1]);
            } else {
                infoCell = $(cells[0]);
            }

            const name = infoCell.find(".title").text().replace(/[●★○]/g, "").trim();
            const fonts = infoCell.find("p font");
            const weekText = $(fonts[0]).text().replace(/周数：/g, "").trim();
            const position = $(fonts[1]).text().replace(/上课地点：/g, "").trim();
            const teacher = $(fonts[2]).text().replace(/教师\s*：/g, "").trim();

            const sectionInfo = parseSectionsFromText(sectionText);
            const weeks = parseWeeks(weekText);
            if (!name || !teacher || !position || !sectionInfo || weeks.length === 0) return;

            courses.push({
                name: name,
                teacher: teacher,
                position: position.split(/\s+/).pop(),
                day: day,
                startSection: sectionInfo.startSection,
                endSection: sectionInfo.endSection,
                weeks: weeks
            });
        });
    });

    return courses;
}

async function scrapeCourses() {
    const response = await fetch(window.location.href);
    const html = await response.text();
    if (!html.includes("课表查询")) {
        await window.AndroidBridgePromise.showAlert(
            "导入失败",
            "当前页面不是课表查询页面，请进入课表查询并点击查询后再导入。",
            "确定"
        );
        return null;
    }

    const viewTypeElement = document.querySelector("#shcPDF");
    if (!viewTypeElement) {
        await window.AndroidBridgePromise.showAlert(
            "导入失败",
            "未识别到课表视图类型，请确认页面已加载完成。",
            "确定"
        );
        return null;
    }

    const viewType = viewTypeElement.dataset["type"];
    const tableElement = document.querySelector(viewType === "list" ? "#kblist_table" : "#kbgrid_table_0");
    if (!tableElement) {
        await window.AndroidBridgePromise.showAlert(
            "导入失败",
            "未找到课表主体，请先执行查询并等待页面加载。",
            "确定"
        );
        return null;
    }

    const courses = viewType === "list" ? parseListView() : parseTableView();
    return courses.length > 0 ? courses : null;
}

async function runImportFlow() {
    const confirmed = await window.AndroidBridgePromise.showAlert(
        "大连大学课表导入",
        "请确认已登录教务系统并打开课表查询页面。",
        "开始导入"
    );
    if (!confirmed) {
        AndroidBridge.showToast("已取消导入");
        return;
    }

    if (typeof window.jQuery === "undefined" && typeof $ === "undefined") {
        AndroidBridge.showToast("页面缺少 jQuery，无法解析课表");
        return;
    }

    try {
        const courses = await scrapeCourses();
        if (!courses || courses.length === 0) {
            AndroidBridge.showToast("未找到可导入课程");
            return;
        }

        await window.AndroidBridgePromise.saveImportedCourses(JSON.stringify(courses));
        AndroidBridge.showToast(`导入成功，共 ${courses.length} 门课程`);
        AndroidBridge.notifyTaskCompletion();
    } catch (error) {
        AndroidBridge.showToast("导入失败: " + error.message);
    }
}

runImportFlow();
