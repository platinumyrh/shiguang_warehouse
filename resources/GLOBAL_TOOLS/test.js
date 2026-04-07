// 大连大学正方教务系统课表适配脚本 (基于 API)

/**
 * 解析周次字符串，处理单双周和周次范围。
 * @param {string} weekStr - 例如 "1-16周(单)", "1-8周,10-18周"
 * @returns {number[]} 解析后的周次数组
 */
function parseWeeks(weekStr) {
    if (!weekStr) return [];

    const weekSets = weekStr.split(',');
    let weeks = [];

    for (const set of weekSets) {
        const trimmedSet = set.trim();

        const rangeMatch = trimmedSet.match(/(\d+)-(\d+)周/);
        const singleMatch = trimmedSet.match(/^(\d+)周/); 

        let start = 0;
        let end = 0;
        let processed = false;

        if (rangeMatch) {
            start = Number(rangeMatch[1]);
            end = Number(rangeMatch[2]);
            processed = true;
        } else if (singleMatch) {
            start = end = Number(singleMatch[1]);
            processed = true;
        }

        if (processed) {
            const isSingle = trimmedSet.includes('(单)');
            const isDouble = trimmedSet.includes('(双)');

            for (let w = start; w <= end; w++) {
                if (isSingle && w % 2 === 0) continue; 
                if (isDouble && w % 2 !== 0) continue; 
                weeks.push(w);
            }
        }
    }

    return [...new Set(weeks)].sort((a, b) => a - b);
}

/**
 * 解析 API 返回的 JSON 数据
 */
function parseJsonData(jsonData) {
    console.log("JS: parseJsonData 正在解析 JSON 数据...");

    if (!jsonData || !Array.isArray(jsonData.kbList)) {
        console.warn("JS: JSON 数据结构错误或缺少 kbList 字段。");
        return [];
    }

    const rawCourseList = jsonData.kbList;
    const finalCourseList = [];

    for (const rawCourse of rawCourseList) {
        if (!rawCourse.kcmc || !rawCourse.xm || !rawCourse.cdmc ||
            !rawCourse.xqj || !rawCourse.jcs || !rawCourse.zcd) {
            continue;
        }

        const weeksArray = parseWeeks(rawCourse.zcd);

        if (weeksArray.length === 0) {
            continue;
        }

        const sectionParts = rawCourse.jcs.split('-');
        const startSection = Number(sectionParts[0]);
        const endSection = Number(sectionParts[sectionParts.length - 1]);

        const day = Number(rawCourse.xqj);

        if (isNaN(day) || isNaN(startSection) || isNaN(endSection) || day < 1 || day > 7 || startSection > endSection) {
            continue;
        }

        finalCourseList.push({
            name: rawCourse.kcmc.trim(),
            teacher: rawCourse.xm.trim(),
            position: rawCourse.cdmc.trim(),
            day: day,
            startSection: startSection,
            endSection: endSection,
            weeks: weeksArray
        });
    }

    finalCourseList.sort((a, b) =>
        a.day - b.day ||
        a.startSection - b.startSection ||
        a.name.localeCompare(b.name)
    );

    console.log(`JS: JSON 数据解析完成，共找到 ${finalCourseList.length} 门课程。`);
    return finalCourseList;
}

function validateYearInput(input) {
    if (/^[0-9]{4}$/.test(input)) {
        return false;
    } else {
        return "请输入四位数字的学年（例如2023）！";
    }
}

async function promptUserToStart() {
    return await window.AndroidBridgePromise.showAlert(
        "大连大学教务系统课表导入",
        "导入前请确保您已在浏览器中成功登录教务系统",
        "好的，开始导入"
    );
}

async function getAcademicYear() {
    const currentYear = new Date().getFullYear().toString();
    const currentMonth = new Date().getMonth() + 1; 
    const defaultYear = currentMonth >= 8 ? currentYear : (Number(currentYear) - 1).toString(); 
    return await window.AndroidBridgePromise.showPrompt(
        "选择学年",
        "请输入要导入课程的起始学年（如2023-2024 应该填2023）:",
        defaultYear,
        "validateYearInput"
    );
}

async function selectSemester() {
    const semesters = ["第一学期", "第二学期"];
    const currentMonth = new Date().getMonth() + 1; 
    const defaultSemesterIndex = currentMonth >= 8 ? 0 : 1; 
    const semesterIndex = await window.AndroidBridgePromise.showSingleSelection(
        "选择学期",
        JSON.stringify(semesters),
        defaultSemesterIndex
    );
    return semesterIndex;
}

/**
 * 将选择索引转换为 API 所需的学期码
 * DLU: 3 (第一学期), 12 (第二学期)
 */
function getSemesterCode(semesterIndex) {
    return semesterIndex === 0 ? "3" : "12";
}

/**
 * 请求和解析课程数据
 */
async function fetchAndParseCourses(academicYear, semesterIndex) {
    AndroidBridge.showToast("正在请求课表数据...");

    const semesterCode = getSemesterCode(semesterIndex);

    // 接口参数
    const xnmXqmBody = `xnm=${academicYear}&xqm=${semesterCode}`;
    
    // API URL - 使用了用户截图中确认的 xskbcx_cxXsgrkb.html 路径
    const url = "/jwglxt/kbcx/xskbcx_cxXsgrkb.html?gnmkdm=N2151";

    console.log(`JS: 发送请求到 ${url}, body: ${xnmXqmBody}`);

    const requestOptions = {
        "headers": {
            "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        },
        "body": xnmXqmBody,
        "method": "POST",
        "credentials": "include"
    };

    try {
        const response = await fetch(url, requestOptions);

        if (!response.ok) {
            throw new Error(`网络请求失败。状态码: ${response.status}`);
        }

        const jsonText = await response.text();
        let jsonData;
        try {
            jsonData = JSON.parse(jsonText);
        } catch (e) {
            AndroidBridge.showToast("数据返回格式错误，可能是您未成功登录或会话已过期。");
            return null;
        }

        const courses = parseJsonData(jsonData);

        if (courses.length === 0) {
            AndroidBridge.showToast("未找到任何课程数据，请检查所选学年学期是否正确或本学期无课。");
            return null;
        }

        return { courses: courses };

    } catch (error) {
        AndroidBridge.showToast(`请求或解析失败: ${error.message}`);
        return null;
    }
}

async function saveCourses(parsedCourses) {
    AndroidBridge.showToast(`正在保存 ${parsedCourses.length} 门课程...`);
    try {
        await window.AndroidBridgePromise.saveImportedCourses(JSON.stringify(parsedCourses, null, 2));
        return true;
    } catch (error) {
        AndroidBridge.showToast(`课程保存失败: ${error.message}`);
        return false;
    }
}

/**
 * 导入流程入口
 */
async function runImportFlow() {
    const alertConfirmed = await promptUserToStart();
    if (!alertConfirmed) {
        AndroidBridge.showToast("用户取消了导入。");
        return;
    }

    const academicYear = await getAcademicYear();
    if (academicYear === null) {
        AndroidBridge.showToast("导入已取消。");
        return;
    }

    const semesterIndex = await selectSemester();
    if (semesterIndex === null || semesterIndex === -1) {
        AndroidBridge.showToast("导入已取消。");
        return;
    }

    const result = await fetchAndParseCourses(academicYear, semesterIndex);
    if (result === null) {
        return;
    }
    const { courses } = result;

    const saveResult = await saveCourses(courses);
    if (!saveResult) {
        return;
    }

    AndroidBridge.showToast(`课程导入成功，共导入 ${courses.length} 门课程！`);
    AndroidBridge.notifyTaskCompletion();
}

runImportFlow();
