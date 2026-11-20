from pathlib import Path


def esc(text):
    return (
        text.replace("\\", "\\\\")
        .replace("{", "\\{")
        .replace("}", "\\}")
        .replace("\n", "\\line ")
    )


parts = [
    r"{\rtf1\ansi\deff0",
    r"{\fonttbl{\f0 Arial;}}",
    r"{\colortbl;\red21\green62\blue117;\red16\green42\blue67;\red82\green96\blue109;}",
    r"\paperw12240\paperh15840\margl760\margr760\margt720\margb720",
    r"\widowctrl",
]


def para(text="", size=21, bold=False, italic=False, color=0, before=0, after=80, indent=0, hang=0):
    fmt = [r"\pard", rf"\sa{after}", rf"\sb{before}", r"\sl276\slmult1", r"\f0", rf"\fs{size}"]
    if indent or hang:
        fmt.append(rf"\li{indent}\fi-{hang}")
    if color:
        fmt.append(rf"\cf{color}")
    if bold:
        fmt.append(r"\b")
    if italic:
        fmt.append(r"\i")
    parts.append("".join(fmt) + " " + esc(text) + (r"\i0" if italic else "") + (r"\b0" if bold else "") + r"\cf0\par")


def run_para(runs, before=0, after=80, indent=0, hang=0):
    fmt = [r"\pard", rf"\sa{after}", rf"\sb{before}", r"\sl276\slmult1", r"\f0", r"\fs21"]
    if indent or hang:
        fmt.append(rf"\li{indent}\fi-{hang}")
    line = "".join(fmt) + " "
    for text, opts in runs:
        size = opts.get("size", 21)
        color = opts.get("color", 0)
        line += rf"\fs{size}"
        if color:
            line += rf"\cf{color}"
        if opts.get("bold"):
            line += r"\b"
        if opts.get("italic"):
            line += r"\i"
        line += " " + esc(text)
        if opts.get("italic"):
            line += r"\i0"
        if opts.get("bold"):
            line += r"\b0"
        line += r"\cf0 "
    parts.append(line + r"\par")


def section(text):
    para(text.upper(), size=25, bold=True, color=1, before=150, after=55)


def page_break():
    parts.append(r"\page")


def bullet(text):
    run_para([("- " + text, {"size": 20})], after=45)


def company(name, dates):
    run_para(
        [
            (name, {"bold": True, "color": 2, "size": 22}),
            ("  |  ", {"color": 3, "size": 20}),
            (dates, {"bold": True, "color": 3, "size": 20}),
        ],
        before=95,
        after=25,
    )


def role(title, meta):
    para(title, size=21, bold=True, color=2, after=10)
    para(meta, size=18, italic=True, color=3, after=45)


def skill(label, value):
    run_para([(label + ": ", {"bold": True, "color": 1, "size": 20}), (value, {"size": 20})], after=45)


def earlier(label, detail, dates):
    run_para(
        [
            ("- " + label, {"bold": True, "color": 2, "size": 20}),
            (" - " + detail + " ", {"size": 20}),
            (dates, {"italic": True, "color": 3, "size": 19}),
        ],
        after=45,
    )


para("Ravi Teja Peetla", size=44, bold=True, color=1, after=25)
para("Senior Technical Architect | GenAI, Applied AI, Data Engineering and Cloud AI Solutions", size=23, bold=True, color=2, after=55)
para("Email: raviteja.peetla@gmail.com | Phone: +91 8142755756 | LinkedIn: www.linkedin.com/in/ravi-teja-292023143", size=18, color=3, after=130)

section("Professional Profile")
para("Senior Technical Architect with nearly 15 years of experience designing and delivering AI, ML, data engineering and enterprise cloud solutions. Strong recent focus on insurance and financial-services use cases, including GenAI assistants, retrieval-augmented generation, natural-language query systems, loss-run document extraction, fraud/churn/loan models and large-scale data pipelines.", after=70)
para("Hands-on architect across Azure OpenAI, AWS Bedrock, Google Vertex AI, LangChain, Python, Spark/PySpark, Azure Cognitive Search, AWS Textract, serverless platforms, Docker, Kubernetes and CI/CD. Experienced in leading teams, converting POCs into production-ready platforms, and building evaluation, monitoring and governance-ready workflows for enterprise AI applications.", after=85)

section("Hartford-Relevant Strengths")
for item in [
    "Insurance AI experience across Arch Insurance and Aurenity, including loss-run extraction, structured insurance data mapping, SQL/NoSQL assistants, semantic search and document intelligence.",
    "Architected GenAI and RAG systems with prompt evaluation, hallucination tracking, accuracy/latency dashboards, secure enterprise integration and cost optimization.",
    "Built automated cloud pipelines using Azure Functions, AWS Lambda, S3 triggers, Step Functions, App Service, RDS, Azure DevOps and GitHub Actions.",
    "Delivered applied ML solutions for fraud detection, churn prediction, loan risk, customer segmentation, next-best offer and high-volume classification.",
    "Led cross-functional engineering teams of up to 9 members with ownership across architecture, implementation, deployment, documentation and production support.",
]:
    bullet(item)

section("Core Skills")
skill("GenAI and LLMs", "Azure OpenAI, OpenAI APIs, AWS Bedrock, Google Vertex AI, GPT-4.1, LangChain, RAG, advanced RAG, embeddings, vector search, prompt engineering, prompt evaluation, Copilot Studio, agent workflows")
skill("Architecture", "Cloud-native solution design, serverless architecture, microservices, API integration, secure enterprise backends, observability, cost optimization, reusable AI frameworks")
skill("Data and ML", "Python, Spark, PySpark, Spark MLlib, Pandas, NumPy, Scikit-learn, TensorFlow, Keras, PyTorch, NLP, OpenCV, XGBoost, Random Forest, regression, classification, clustering")
skill("Cloud and DevOps", "Azure, AWS, GCP, Azure Cognitive Search, Azure App Service, Azure Functions, AWS Lambda, AWS Textract, S3, RDS, Docker, Kubernetes, AKS, EKS, Azure DevOps, GitHub Actions, AWS CodePipeline")
skill("Data Platforms", "SQL, NoSQL, MongoDB, FAISS, Hive, HDFS, Teradata, MySQL, PostgreSQL, Splunk, Qlik Sense, Informatica, ETL, data warehousing")

section("Selected Impact")
for item in [
    "Processed 3,000+ insurance loss-run documents and converted them into 420,000+ structured records in AWS RDS.",
    "Architected a natural-language SQL/NoSQL assistant for insurance data access using Azure OpenAI, LangChain and hybrid semantic search.",
    "Designed ML classification solutions at very large scale, including 270M subscribers for Indosat, 4M subscribers for Ooredoo Kuwait and 300M financial transactions.",
    "Built model evaluation dashboards tracking accuracy, latency, query correctness and hallucination rate for enterprise GenAI applications.",
    "Created reusable GenAI components for prompt templates, RAG orchestration, evaluation pipelines and vector search utilities.",
]:
    bullet(item)

page_break()
section("Professional Experience")
company("Coforge", "May 2024 - Present")
role("Senior Technical Architect - DBVoice | Client: Arch Insurance", "Feb 2025 - Present | Azure OpenAI, GPT-4.1, Azure Cognitive Search, Azure App Service, Azure Functions, LangChain, FAISS, MongoDB, Python, Flask, Azure DevOps")
for item in [
    "Designed and implemented a natural-language to SQL/NoSQL translation engine for structured and unstructured insurance data access.",
    "Architected the solution on Azure using GPT-4.1, large embeddings, LangChain and hybrid search for intent parsing, semantic retrieval and query generation.",
    "Built an evaluation framework to measure query correctness, accuracy, latency and hallucination rate, with dashboards for ongoing model performance review.",
    "Engineered secure Flask and Azure Functions backends supporting SQL/NoSQL integration, role-aware access patterns and enterprise deployment requirements.",
    "Implemented FAISS and MongoDB hybrid search to combine semantic retrieval with keyword-based insurance data lookup.",
    "Productionized the application through Azure DevOps CI/CD, automated tests, monitoring, versioned releases, architecture documentation and MLOps-ready workflows.",
]:
    bullet(item)

role("Senior Technical Architect - GenAI Architecture and POCs | Multiple Clients", "May 2024 - Present | Python, Azure OpenAI, AWS Bedrock, Vertex AI, LangChain, RAG, vector databases, Flask, FastAPI, React, Copilot Studio, Docker, GitHub Actions")
for item in [
    "Designed and delivered GenAI POCs including conversational assistants, recommendation engines and agent-based workflows using LangChain and modern LLM architectures.",
    "Developed RAG and advanced RAG pipelines with embeddings, hybrid search and multi-step orchestration for domain-specific conversational intelligence.",
    "Built Copilot Studio extensions that connect LLM capabilities with enterprise data through secure connectors and custom AI behaviors.",
    "Created reusable GenAI frameworks for evaluation, prompt templates, RAG orchestration and vector search to speed up delivery across client engagements.",
    "Led architecture, implementation, optimization and deployment with emphasis on scalable, cost-efficient and production-ready cloud design.",
]:
    bullet(item)

role("Senior Technical Architect - Loss Run File Extraction | Client: Aurenity", "Oct 2024 - Feb 2025 | AWS Textract, AWS Lambda, S3, RDS MySQL, Python, spaCy NER, Step Functions, Docker, AWS CodePipeline, Pandas")
for item in [
    "Architected and developed an automated pipeline to convert unstructured PDF insurance reports into structured JSON outputs.",
    "Used AWS Textract and custom NER models to extract and map insurance fields with strong data quality controls.",
    "Processed 3,000+ loss-run documents, producing 420,000+ structured records uploaded into AWS MySQL RDS.",
    "Implemented event-driven processing with Lambda, S3 triggers and Step Functions for continuous ingestion, monitoring and retry handling.",
    "Established CI/CD, logging, auditing, schema standardization, validation and error-handling workflows for production stability.",
]:
    bullet(item)

company("Virtusa Consulting Services Pvt Ltd", "May 2022 - May 2024")
role("Associate Architect - Project Infinity | Client: PMI", "Jun 2023 - May 2024 | Python, Azure Blob Storage, Azure Cognitive Services, Form Recognizer, Azure OpenAI, LangChain, Postman, Swagger, Scikit-learn")
for item in [
    "Led a 7-member team delivering a proprietary-document GenAI question-answering solution on Azure.",
    "Built pipelines to collect PDF and web-scraped content, store it in Azure Blob Storage and extract text using Form Recognizer.",
    "Implemented Azure Cognitive Search and prompt flows for query, answer and follow-up generation grounded in proprietary content.",
    "Evaluated model responses using LangChain and created dashboards to track accuracy as new content was uploaded.",
    "Used Azure Functions to trigger chunking and preprocessing scripts for improved retrieval quality.",
]:
    bullet(item)

role("Associate Architect - Solution Central Apps | Client: Anthem", "May 2022 - Jun 2023 | Python, Splunk, Scikit-learn, Matplotlib, Teradata, Splunk Visualization")
for item in [
    "Led a 4-member team building analytics and ML workflows over JSON, CSV and database sources.",
    "Processed data in Splunk using SPL and built classification/regression models for operational analytics.",
    "Created visual analysis of model predictions in Splunk and scheduled production jobs using crontab.",
]:
    bullet(item)

company("Comviva Technologies", "Jan 2020 - Aug 2021")
role("Technical Lead - Customer Value Solutions | Clients: Ooredoo Kuwait, Indosat Indonesia", "Python, Scikit-learn, Keras, Matplotlib, Teradata, Qlik Sense, Unix, Crontab")
for item in [
    "Led a 9-member team building churn, port-out, next-recharge, latest-offer and next-best-offer models.",
    "Created Teradata data marts by joining 40+ tables and prepared modeling datasets for large-scale customer analytics.",
    "Designed classification methods for 270M Indosat subscribers and 4M Ooredoo Kuwait subscribers.",
    "Productionized models using Teradata BTEQ scripts, shell commands and crontab, and delivered dashboards in Qlik Sense.",
]:
    bullet(item)

company("Virtusa Consulting Services Pvt Ltd", "May 2018 - Jan 2020")
role("Lead Consultant - EPIC Project | Client: M&T Bank", "Python, Scikit-learn, Matplotlib, Spark, PySpark, Keras, H2O")
for item in [
    "Built credit card fraud detection, customer churn and bad-loan prediction models for banking data products.",
    "Performed data wrangling, preprocessing, scaling, normalization, imputation and feature engineering in Python.",
    "Used text mining and regular expressions to develop domain-specific dictionaries for classification workflows.",
    "Designed classification methods to categorize 300M business transactions by category and channel type into 60K business entities.",
    "Developed customer segmentation, credit scoring and pricing models using ML and deep learning techniques.",
]:
    bullet(item)

company("Earlier Experience", "Jun 2011 - May 2018")
earlier("OSI Technologies Pvt Ltd, Principal Engineer", "Built handwritten digit classification models using DNN, KNN, TensorFlow and image preprocessing techniques.", "Jul 2017 - May 2018")
earlier("LiquidHub India Pvt Ltd, Software Engineer", "Built univariate and multivariate car-sales prediction models using TensorFlow, Keras, Python, Pandas and NumPy; achieved close to 95% accuracy.", "Jan 2017 - May 2017")
earlier("Kofax India Pvt Ltd, Software Engineer", "Developed classification models using TensorFlow, Keras and Python, including web scraping, decision tree/random tree modeling and validation with confusion matrices; achieved 92% accuracy.", "Feb 2015 - Jan 2017")
earlier("Bodh Tree Consulting Ltd, Software Engineer", "Delivered ETL, testing and BPM work across GE Capital and Total Agility projects using Informatica, Unix, Teradata, SQL Server, .NET, Azure and Agile delivery practices.", "Jun 2011 - Jan 2015")

parts.append("}")
Path("RaviTeja_Hartford_CV_Compatible.rtf").write_text("\n".join(parts), encoding="utf-8")
print(Path("RaviTeja_Hartford_CV_Compatible.rtf").resolve())
