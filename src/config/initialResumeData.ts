import { DEFAULT_FIELD_ORDER } from "./constants";
import { GlobalSettings, DEFAULT_CONFIG } from "../types/resume";
const initialGlobalSettings: GlobalSettings = {
  baseFontSize: 16,
  pagePadding: 32,
  paragraphSpacing: 12,
  lineHeight: 1.5,
  sectionSpacing: 10,
  headerSize: 18,
  subheaderSize: 16,
  useIconMode: true,
  themeColor: "#000000",
  centerSubtitle: true,
  pageBreakLinesVisible: true,
};

export const initialResumeState = {
  title: "新建简历",
  basic: {
    name: "叶安燃",
    title: "战术行动专员",
    employementStatus: "在职",
    email: "anran.ye@example.com",
    phone: "13800138000",
    location: "中国·成都",
    birthDate: "2003-08-08",
    fieldOrder: DEFAULT_FIELD_ORDER,
    icons: {
      email: "Mail",
      phone: "Phone",
      birthDate: "CalendarRange",
      employementStatus: "Briefcase",
      location: "MapPin",
    },
    photoConfig: DEFAULT_CONFIG,
    customFields: [
      {
        id: "personal",
        label: "个人网站",
        value: "https://anran.dev",
        icon: "Globe",
      },
    ],
    photo: "/avatar-anran.jpg",
    githubKey: "",
    githubUseName: "",
    githubContributionsVisible: false,
  },
  education: [
    {
      id: "1",
      school: "五行大学 · 火学院",
      major: "武术战斗战略",
      degree: "本科",
      startDate: "2021-09",
      endDate: "2025-06",
      visible: true,
      gpa: "",
      description: `<ul>
        <li>以专业第一名成绩毕业，入学后长期保持火学院优秀训练表现</li>
        <li>系统学习以传统武术哲学为基础的现代战斗战略与实战方法</li>
        <li>在高强度战斗训练、战术判断与个人作战能力方面表现突出</li>
        <li>核心课程：现代战斗战略、武术哲学与战术决策、高机动近距离作战、战场态势判断、小队战术与协同作战、城市环境战术、危机管理与人员疏散</li>
      </ul>`,
    },
  ],
  skillContent: `<div class="skill-content">
  <ul>
    <li>战斗与武术：中国武术 ★★★★★、竞技武术套路 ★★★★★、近距离格斗 ★★★★★、中国古典舞 ★★★★☆</li>
    <li>战术能力：战场态势判断 ★★★★★、单兵作战 ★★★★★、小队协同 ★★★★☆、战术指导 ★★★★☆</li>
    <li>特殊战斗技术：朱雀扇（高温火焰投射）、火焰控制（持续燃烧压制）、高机动作战（高速位移与突破）、战斗恢复</li>
  </ul>
</div>`,
  selfEvaluationContent: `<p>拥有长期武术训练背景和系统化战斗战略教育经历，习惯在高标准和高压力环境下完成任务。</p><p>对自己以及团队成员均保持较高要求，面对问题倾向于直接指出并推动解决。真正可靠的能力并不是在理想环境中完成训练，而是在情况失控之后依然能够作出正确判断。</p><p>长期竞技训练让我习惯失败、伤病和重复训练，也形成了持续突破个人极限的习惯。擅长独立承担高风险任务，同时正在学习如何将个人能力转化为更成熟的团队协作与领导能力。</p>`,
  experience: [
    {
      id: "1",
      company: "守望先锋 Overwatch",
      position: "行动干员 · 战术作战方向",
      date: "2025.07 - 至今",
      visible: true,
      details: `<ul>
      <li>接受守望先锋邀请后加入组织，参与应对全球范围内不断升级的武装冲突</li>
      <li>执行高风险地区战术行动，负责高机动突击、侧翼突破及重点目标压制</li>
      <li>根据现场战况独立制定短周期战术方案，配合不同能力类型的成员执行联合行动</li>
      <li>在复杂城市环境中执行人员保护与撤离任务</li>
      <li>运用朱雀扇及火焰战斗技术进行近、中距离作战</li>
      <li>代表经历：抵达直布罗陀基地期间遭遇黑爪突袭，直接参与战斗</li>
    </ul>`,
    },
  ],
  draggingProjectId: null,
  projects: [
    {
      id: "p1",
      name: "成都城市紧急撤离与防卫行动",
      role: "火学院学生战斗小队核心成员",
      date: "2025.05",
      description: `<ul>
        <li>归零者袭击成都，正规力量抵达前火学院学生被部署至现场协助平民撤离</li>
        <li>判断现场主要威胁方向，协助制定平民撤离路径</li>
        <li>与学生战斗小队建立临时防御阵线，保护缺乏战斗能力的平民</li>
        <li>防线被突破后主动承担断后任务，独自牵制敌方单位为其他人争取时间</li>
        <li>在敌方数量占明显优势的情况下争取到关键撤离时间，随后与叶无漾协同突破包围撤离</li>
        <li>行动记录受到守望先锋关注，最终获得组织正式招募邀请</li>
      </ul>`,
      visible: true,
    },
    {
      id: "p2",
      name: "火系战斗武器联合研究项目",
      role: "武术动作适配 · 实战测试",
      date: "2024.09 - 2025.01",
      description: `<ul>
        <li>五行大学火学院 × 金学院合作项目，参与火属性战斗长棍原型装备研究</li>
        <li>负责武术动作适配、武器实战测试、火焰输出方式设计与人体工学反馈</li>
        <li>完成第一阶段原型测试；测试中出现能量控制事故造成庭院起火，随后进行安全性复盘</li>
        <li>认识到高性能战斗装备的设计不能仅考虑输出能力，必须把安全冗余、使用者控制能力与复杂环境风险一并纳入设计</li>
      </ul>`,
      visible: true,
    },
  ],
  menuSections: [
    { id: "basic", title: "基本信息", icon: "👤", enabled: true, order: 0 },
    { id: "education", title: "教育经历", icon: "🎓", enabled: true, order: 1 },
    { id: "experience", title: "工作经验", icon: "💼", enabled: true, order: 2 },
    { id: "skills", title: "专业技能", icon: "⚡", enabled: true, order: 3 },
    { id: "projects", title: "项目经历", icon: "🚀", enabled: true, order: 4 },
    { id: "campus", title: "校园经历", icon: "🏫", enabled: true, order: 5 },
    { id: "honors", title: "获奖情况", icon: "🎖️", enabled: true, order: 6 },
    { id: "selfEvaluation", title: "自我评价", icon: "💬", enabled: true, order: 7 },
  ],
  certificates: [],
  customData: {
    campus: [
      {
        id: "c1",
        title: "五行大学火学院",
        subtitle: "学生训练负责人 / 高年级学生导师",
        dateRange: "2023.09 - 2025.06",
        visible: true,
        description: `<ul>
        <li>协助低年级学生进行武术及实战训练，参与学院高强度战斗模拟训练</li>
        <li>对训练动作、战斗策略和现场决策提供改进意见，帮助表现落后的学生制定针对性训练计划</li>
        <li>长期承担学生间非正式指导角色，指导风格偏直接、严格</li>
      </ul>`,
      },
      {
        id: "c2",
        title: "五行大学校级武术代表队",
        subtitle: "核心运动员",
        dateRange: "2021.09 - 2025.06",
        visible: true,
        description: `<ul>
        <li>入学前已拥有多年竞技武术套路经验</li>
        <li>入学后主动结束职业竞技生涯，将主要精力投入火学院武术与战斗战略研究</li>
        <li>继续保持高水平日常训练</li>
      </ul>`,
      },
    ],
    honors: [
      {
        id: "h1",
        title: "五行大学火学院优秀毕业生",
        subtitle: "",
        dateRange: "2025.06",
        visible: true,
        description: "以专业第一名成绩完成火学院全部培养项目",
      },
      {
        id: "h2",
        title: "守望先锋招募资格",
        subtitle: "",
        dateRange: "2025.06",
        visible: true,
        description: "因成都防卫行动中的表现受到守望先锋关注，与叶无漾共同获得加入邀请",
      },
      {
        id: "h3",
        title: "成都防卫行动特别表彰",
        subtitle: "",
        dateRange: "2025.05",
        visible: true,
        description: "因在归零者袭击期间保护平民并掩护学生小队撤离获得特别表彰",
      },
      {
        id: "h4",
        title: "五行大学火学院年度优秀学生",
        subtitle: "",
        dateRange: "2022 - 2024",
        visible: true,
        description: "",
      },
      {
        id: "h5",
        title: "全国青年武术套路赛事奖项",
        subtitle: "",
        dateRange: "2019",
        visible: true,
        description: "多次进入全国及地区赛事前三名",
      },
      {
        id: "h6",
        title: "青少年武术套路纪录保持者",
        subtitle: "",
        dateRange: "2016 - 2019",
        visible: true,
        description: "竞技生涯期间连续多年刷新相关赛事纪录",
      },
      {
        id: "h7",
        title: "中国古典舞青年组奖项",
        subtitle: "",
        dateRange: "2018",
        visible: true,
        description: "",
      },
    ],
  },
  activeSection: "basic",
  globalSettings: initialGlobalSettings,
};

export const initialResumeStateEn = {
  title: "New Resume",
  basic: {
    name: "Dva",
    title: "Senior Frontend Engineer",
    employementStatus: "Available",
    email: "john.smith@123.com",
    phone: "555-123-4567",
    location: "San Francisco, CA",
    birthDate: "",
    fieldOrder: DEFAULT_FIELD_ORDER,
    icons: {
      email: "Mail",
      phone: "Phone",
      birthDate: "CalendarRange",
      employementStatus: "Briefcase",
      location: "MapPin",
    },
    photoConfig: DEFAULT_CONFIG,
    customFields: [],
    photo: "/avatar.png",
    githubKey: "",
    githubUseName: "",
    githubContributionsVisible: false,
  },
  education: [
    {
      id: "1",
      school: "Stanford University",
      major: "Computer Science",
      degree: "",
      startDate: "2013-09",
      endDate: "2017-06",
      visible: true,
      gpa: "",
      description: `<ul>
        <li>Core courses: Data Structures, Algorithms, Operating Systems, Computer Networks, Web Development</li>
        <li>Top 5% of class, received Dean's List honors for three consecutive years</li>
        <li>Served as Technical Director of the Computer Science Association, organized multiple tech workshops</li>
        <li>Contributed to open-source projects, earned GitHub Campus Expert certification</li>
      </ul>`,
    },
  ],
  skillContent: `<div class="skill-content">
  <ul>
    <li>Frontend Frameworks: React, Vue.js, Next.js, Nuxt.js and other SSR frameworks</li>
    <li>Languages: TypeScript, JavaScript(ES6+), HTML5, CSS3</li>
    <li>UI/Styling: TailwindCSS, Sass/Less, CSS Modules, Styled-components</li>
    <li>State Management: Redux, Vuex, Zustand, Jotai, React Query</li>
    <li>Build Tools: Webpack, Vite, Rollup, Babel, ESLint</li>
    <li>Testing: Jest, React Testing Library, Cypress</li>
    <li>Performance: Browser rendering principles, performance metrics monitoring, code splitting, lazy loading</li>
    <li>Version Control: Git, SVN</li>
    <li>Technical Leadership: Team management experience, led technology selection and architecture design for large projects</li>
  </ul>
</div>`,
  selfEvaluationContent: "",
  experience: [
    {
      id: "1",
      company: "ByteDance",
      position: "Senior Frontend Engineer",
      date: "2021.07 - 2024.12",
      visible: true,
      details: `<ul>
      <li>Responsible for development and maintenance of TikTok Creator Platform, leading technical solution design for core features</li>
      <li>Optimized build configuration, reducing build time from 8 minutes to 2 minutes, improving team development efficiency</li>
      <li>Designed and implemented component library, increasing code reuse by 70%, significantly reducing development time</li>
      <li>Led performance optimization project, reducing platform first-screen loading time by 50%, integrated APM monitoring system</li>
      <li>Mentored junior engineers, organized technical sharing sessions to improve overall team technical capabilities</li>
    </ul>`,
    },
  ],
  draggingProjectId: null,
  projects: [
    {
      id: "p1",
      name: "TikTok Creator Platform",
      role: "Frontend Lead",
      date: "2022.06 - 2023.12",
      description: `<ul>
        <li>React-based analytics and content management platform serving millions of creators</li>
        <li>Includes data analytics, content management, and revenue management subsystems</li>
        <li>Implemented Redux for state management, enabling efficient handling of complex data flows</li>
        <li>Used Ant Design component library to ensure UI consistency and user experience</li>
        <li>Implemented code splitting and lazy loading strategies to optimize loading performance</li>
      </ul>`,
      visible: true,
    },
    {
      id: "p2",
      name: "WeChat Mini Program Developer Tools",
      role: "Core Developer",
      date: "2020.03 - 2021.06",
      description: `<ul>
        <li>All-in-one solution for mini program development, debugging, and publishing</li>
        <li>Cross-platform desktop application built with Electron</li>
        <li>Supports multiple platforms including Windows, macOS, and Linux</li>
        <li>Provides real-time error logging and performance analysis tools</li>
        <li>Integrates third-party plugins and SDKs for custom functionality</li>
      </ul>`,
      visible: true,
    },
    {
      id: "p3",
      name: "Frontend Monitoring Platform",
      role: "Technical Lead",
      date: "2021.09 - 2022.05",
      description: `<ul>
        <li>Complete frontend monitoring solution including error tracking, performance monitoring, and user behavior analysis</li>
        <li>Built with Vue and Element UI, providing real-time monitoring data and visualization tools</li>
        <li>Supports various monitoring metrics including error logs, performance indicators, and user behavior analysis</li>
        <li>Provides detailed error logs and performance analysis tools to help developers identify and optimize issues</li>
        <li>Integrates third-party plugins and SDKs for custom functionality</li>
      </ul>`,
      visible: true,
    },
  ],
  menuSections: [
    {
      id: "basic",
      title: "Profile",
      icon: "👤",
      enabled: true,
      order: 0,
    },
    {
      id: "skills",
      title: "Skills",
      icon: "⚡",
      enabled: true,
      order: 1,
    },
    {
      id: "experience",
      title: "Experience",
      icon: "💼",
      enabled: true,
      order: 2,
    },
    {
      id: "projects",
      title: "Projects",
      icon: "🚀",
      enabled: true,
      order: 3,
    },
    {
      id: "education",
      title: "Education",
      icon: "🎓",
      enabled: true,
      order: 4,
    },
  ],
  certificates: [],
  customData: {},
  activeSection: "basic",
  globalSettings: initialGlobalSettings,
};

export const blankResumeState = {
  ...initialResumeState,
  title: "新建简历",
  basic: {
    ...initialResumeState.basic,
    name: "",
    title: "",
    email: "",
    phone: "",
    location: "",
    birthDate: "",
    employementStatus: "",
    photo: "",
    customFields: [],
  },
  education: [],
  skillContent: "",
  selfEvaluationContent: "",
  experience: [],
  projects: [],
  certificates: [],
  menuSections: [initialResumeState.menuSections[0]],
};

export const blankResumeStateEn = {
  ...initialResumeStateEn,
  title: "New Resume",
  basic: {
    ...initialResumeStateEn.basic,
    name: "",
    title: "",
    email: "",
    phone: "",
    location: "",
    birthDate: "",
    employementStatus: "",
    photo: "",
    customFields: [],
  },
  education: [],
  skillContent: "",
  selfEvaluationContent: "",
  experience: [],
  projects: [],
  certificates: [],
  menuSections: [initialResumeStateEn.menuSections[0]],
};
