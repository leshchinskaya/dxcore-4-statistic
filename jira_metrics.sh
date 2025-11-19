#!/usr/bin/env bash
set -euo pipefail

# --- 1. Окружение и конфигурация ---

# Настройки Jira (можно переопределить через переменные окружения)
JIRA_BASE_URL="${JIRA_BASE_URL:-https://jira.surf.dev}"
JIRA_USER="${JIRA_USER:-your.login@surf.dev}"
JIRA_TOKEN="${JIRA_TOKEN:-your_password_or_api_token}"
JIRA_API_VERSION="${JIRA_API_VERSION:-2}" # Используем v2 по умолчанию для Jira Server/DC
# Список проектов для фильтрации (опционально, через запятую)
# Например: export JIRA_PROJECTS="ART, ASTR, BCR, IKH, LRP, RIG, MFG"
JIRA_PROJECTS="${JIRA_PROJECTS:-}"

# Проверка, что пользователь не пытается запустить скрипт с дефолтными данными
if [[ "$JIRA_USER" == "your.login@surf.dev" ]] || [[ "$JIRA_TOKEN" == "your_password_or_api_token" ]]; then
    echo "Error: Default credentials detected. Please set JIRA_USER and JIRA_TOKEN environment variables." >&2
    echo "Usage:" >&2
    echo "  export JIRA_USER=\"your.email@surf.dev\""
    echo "  export JIRA_TOKEN=\"your_api_token_or_password\""
    echo "  ./jira_metrics.sh" >&2
    exit 1
fi

# Проверка наличия необходимых утилит
if ! command -v jq &> /dev/null; then
    echo "Error: jq is required but not installed." >&2
    exit 1
fi
if ! command -v curl &> /dev/null; then
    echo "Error: curl is required but not installed." >&2
    exit 1
fi

# Вычисление даты (6 месяцев назад) с поддержкой Linux (GNU) и macOS (BSD)
if date -d '6 months ago' +%Y-%m-%d >/dev/null 2>&1; then
  DATE_FROM=$(date -d '6 months ago' +%Y-%m-%d)
else
  DATE_FROM=$(date -v -6m +%Y-%m-%d)
fi

echo "Script started. Fetching data since: ${DATE_FROM}" >&2

# --- 2. Получение данных из Jira (REST API + JQL) ---

# Функция для выполнения запроса к API
jira_search() {
  local jql="$1"
  local start_at="$2"
  
  # Мы используем curl без явного указания customfield, потому что хотим получить ВСЕ поля,
  # а затем jq выберет нужные.
  # Но API Jira обычно требует явного перечисления полей, иначе вернет только стандартные.
  # Т.к. мы не знаем ID Board/Severity, попробуем запросить *all* navgable fields через "fields=*all" 
  # ИЛИ будем надеяться, что customfield_10027 и 10028 - верные. 
  # В данном случае, пользователь предоставил HTML, где нет явных customfield_ с именем Board.
  # В Jira Server поле Board (Rapid View) часто не хранится как custom field в issue, а вычисляется.
  # Однако Sprint часто хранится. 
  # Попробуем запросить ВСЕ customfield (wildcard *all не всегда работает в v2 search API в fields, 
  # но работает "*all" или просто перечисление).
  
  # UPD: Попробуем запросить стандартные + известные ID из HTML, которые мы нашли:
  # customfield_10008, customfield_10010, customfield_10703, customfield_11300 (Sprint?), etc.
  
    # Чтобы не гадать, запросим "*all" (все поля) + "comment" (он часто в fields, но иногда требует отдельного указания).
  
  curl -s -u "${JIRA_USER}:${JIRA_TOKEN}" \
    -G "${JIRA_BASE_URL}/rest/api/${JIRA_API_VERSION}/search" \
    --data-urlencode "jql=${jql}" \
    --data-urlencode "startAt=${start_at}" \
    --data-urlencode "maxResults=100" \
    --data-urlencode "fields=*all,comment" \
    --data-urlencode "expand=changelog"
}

# --- 2.1. Проверка подключения (Pre-flight check) ---
echo "Checking connection to Jira..." >&2
MYSELF_CHECK=$(curl -s -u "${JIRA_USER}:${JIRA_TOKEN}" "${JIRA_BASE_URL}/rest/api/${JIRA_API_VERSION}/myself")

if echo "$MYSELF_CHECK" | grep -q "Unauthorized"; then
    echo "Error: 401 Unauthorized. Please check your login and password/token." >&2
    echo "Tip: If your password contains special characters (e.g., !, $, #), enclose it in single quotes when exporting:" >&2
    echo "  export JIRA_TOKEN='my\$uperP@ssword'" >&2
    exit 1
elif echo "$MYSELF_CHECK" | grep -q "Login"; then
    echo "Error: Received HTML Login page instead of JSON. Check URL or Auth." >&2
    exit 1
fi

if ! echo "$MYSELF_CHECK" | jq -e '.accountId, .name, .key' >/dev/null 2>&1; then
    # Некоторые старые версии Jira могут не возвращать accountId, проверим name или key
    if ! echo "$MYSELF_CHECK" | jq -e '.name' >/dev/null 2>&1; then
         echo "Warning: Could not validate credentials via /myself endpoint. Proceeding anyway..." >&2
         echo "Response start: ${MYSELF_CHECK:0:100}" >&2
    fi
else
    echo "Connection successful! Logged in as: $(echo "$MYSELF_CHECK" | jq -r '.displayName // .name')" >&2
fi

# JQL запрос: закрытые задачи нужных типов за последние 6 месяцев
# Мы запрашиваем Task, Bug, Incident, Improvement, Service task, а также Test Execution и Sub Test Execution.
BASE_JQL="issuetype in (Task, Bug, Incident, Improvement, \"Service task\", \"Test Execution\", \"Sub Test Execution\") AND statusCategory = Done AND resolutiondate >= \"${DATE_FROM}\""

if [ -n "${JIRA_PROJECTS}" ]; then
    echo "Filtering by projects: ${JIRA_PROJECTS}" >&2
    # Добавляем скобки и project in (...)
    JQL="(${BASE_JQL}) AND project in (${JIRA_PROJECTS})"
else
    echo "Fetching issues from ALL projects." >&2
    JQL="${BASE_JQL}"
fi

ALL_ISSUES_FILE="all_issues.json"
echo '[]' > "${ALL_ISSUES_FILE}"

start_at=0

echo "Downloading issues..." >&2

while :; do
  # Выполняем запрос
  RESPONSE=$(jira_search "${JQL}" "${start_at}")
  
  # Проверка валидности JSON
  if ! echo "$RESPONSE" | jq empty > /dev/null 2>&1; then
      echo "Error: Received invalid JSON from Jira API." >&2
      echo "It is likely an HTML error page (e.g., 404, 401, 403, or SSO redirect)." >&2
      echo "Response snippet:" >&2
      echo "$RESPONSE" | head -n 20 >&2
      exit 1
  fi
  
  # Проверка на ошибки API (в JSON)
  if echo "$RESPONSE" | jq -e '.errorMessages' >/dev/null 2>&1; then
      echo "Error from Jira API: $(echo "$RESPONSE" | jq -r '.errorMessages[]')" >&2
      exit 1
  fi

  # Подсчет количества полученных задач
  ISSUES_COUNT=$(echo "${RESPONSE}" | jq '.issues | length')
  
  if [ -z "$ISSUES_COUNT" ] || [ "$ISSUES_COUNT" == "null" ]; then
      echo "Error parsing response or no issues field." >&2
      echo "Response snippet: ${RESPONSE:0:200}..." >&2
      exit 1
  fi

  echo "  fetched ${ISSUES_COUNT} issues (startAt: ${start_at})" >&2

  if [ "${ISSUES_COUNT}" -eq 0 ]; then
    break
  fi

  # Дописываем в общий массив (используем файлы вместо переменной для надежности)
  TMP=$(mktemp)
  echo "${RESPONSE}" | jq ".issues" > "${TMP}"

  TMP_MERGED=$(mktemp)
  jq -s '.[0] + .[1]' "${ALL_ISSUES_FILE}" "${TMP}" > "${TMP_MERGED}"
  mv "${TMP_MERGED}" "${ALL_ISSUES_FILE}"
  
  rm "${TMP}"

  # Обновляем start_at
  # Используем ((...)) для арифметики
  (( start_at += ISSUES_COUNT ))
done

echo "Download complete. Saved to ${ALL_ISSUES_FILE}." >&2

# --- 2.2. Дополнительно: Выгрузка названий Эпиков ---
# Так как в задаче есть только Epic Link (ключ), нам нужно получить название эпика.
# 1. Собираем все уникальные ключи эпиков
echo "Extracting unique Epic keys..." >&2
jq -r 'map(.fields.customfield_10008) | map(select(. != null)) | unique | .[]' "${ALL_ISSUES_FILE}" > epic_keys.txt

EPIC_COUNT=$(wc -l < epic_keys.txt | tr -d ' ')
echo "Found ${EPIC_COUNT} unique epics linked." >&2

EPICS_FILE="epics_details.json"
echo '[]' > "${EPICS_FILE}"

if [ "$EPIC_COUNT" -gt 0 ]; then
  echo "Fetching Epic details (Summary/Epic Name)..." >&2
  # Разбиваем на пачки по 50 штук, чтобы не превысить лимит URL
  cat epic_keys.txt | xargs -n 50 | while read -r chunk; do
      # Формируем JQL: key in (A, B, C)
      # Заменяем пробелы на запятые
      keys_csv=$(echo "$chunk" | tr ' ' ',')
      
      # Запрашиваем поля: summary и customfield_10004 (Epic Name стандартно). 
      # Если customfield_10004 отличается, скрипт возьмет summary.
      EPIC_JQL="key in (${keys_csv})"
      
      # Используем нашу функцию, но переопределим fields
      # Нам не нужны все поля, только имя
      curl -s -u "${JIRA_USER}:${JIRA_TOKEN}" \
        -G "${JIRA_BASE_URL}/rest/api/${JIRA_API_VERSION}/search" \
        --data-urlencode "jql=${EPIC_JQL}" \
        --data-urlencode "maxResults=100" \
        --data-urlencode "fields=summary,customfield_10004" > "epics_chunk.json"

      # Мержим
      TMP_MERGED=$(mktemp)
      # jq может ругаться, если файл пустой или невалидный, добавим проверку
      if jq -e '.issues' "epics_chunk.json" >/dev/null 2>&1; then
         jq -s '.[0] + (.[1].issues // [])' "${EPICS_FILE}" "epics_chunk.json" > "${TMP_MERGED}"
         mv "${TMP_MERGED}" "${EPICS_FILE}"
      else
         echo "Warning: Failed to fetch chunk of epics." >&2
      fi
      rm -f "epics_chunk.json"
  done
fi

# Создаем mapping файл: Key -> Epic Name (или Summary)
jq '
  map(
    {
      key: .key,
      name: (.fields.customfield_10004 // .fields.summary // "Unknown")
    }
  ) | from_entries
' "${EPICS_FILE}" > epics_map.json

# --- 3. Расчёт метрик на уровне задач ---

echo "Processing issues..." >&2

# Преобразуем в плоский список и считаем время цикла для Task
# Передаем epics_map.json как аргумент --slurpfile
jq --slurpfile epics_map epics_map.json '
  ($epics_map[0]) as $emap |
  map(
    . as $i
    | .fields as $f
    | ($f.customfield_10008 // "") as $elink
    | {
        key: .key,
        project_key: $f.project.key,
        summary: $f.summary,
        assignee: ($f.assignee.displayName // "Unassigned"),
        priority: ($f.priority.name // "None"),
        # Пытаемся найти Severity и Board среди кастомных полей.
        # Board часто это Sprint (customfield_10007 или похожие). 
        # В данном случае мы не знаем точный ID, поэтому выведем "Unknown" или попробуем угадать, если найдем.
        # Но лучше просто сохранить поля как есть, если пользователь их укажет.
        # В HTML мы нашли customfield_10008, 10703, 12700...
        
        # UPD: Пользователь жалуется на отсутствие labels. 
        # labels - это массив строк. В HTML страницы просмотра задачи labels могут быть скрыты, если пустые.
        # Но в JSON API они приходят как массив "labels": ["CR", "Hotfix"].
        labels: ($f.labels // []),
        
        # UPD: Нашли Board (Flutter) в customfield_10703
        board: ($f.customfield_10703.value // $f.customfield_10703 // "None"),
        severity: ($f.customfield_10028.value // $f.customfield_10028 // "None"), 
        
        # Components (массив имен)
        components: (($f.components // []) | map(.name)),
        
        # Sprint (customfield_10010) - обычно массив строк вида "com.atlassian.greenhopper.service.sprint.Sprint@..."
        # Извлекаем имя спринта через regex, если получится, или берем как есть
        sprint: (
          if $f.customfield_10010 
          then ($f.customfield_10010 | map(capture("name=(?<name>[^,]+)") | .name) // $f.customfield_10010)
          else [] end
        ),

        # Epic Link (customfield_10008)
        epic_link: $elink,
        # Epic Name (берем из словаря по ключу)
        epic_name: (if $elink != "" then ($emap[$elink] // $elink) else "None" end),

        # Description (может быть null)
        description: ($f.description // ""),
        
        # Comments (массив объектов: author, body, created)
        # Берем только последние 50, чтобы не раздувать JSON бесконечно
        comments: (
          ($f.comment.comments // []) 
          | map({
              author: (.author.displayName // .author.name // "Unknown"),
              body: .body,
              created: .created
            })
        ),

        issuetype: $f.issuetype.name,
        timeoriginalestimate: ($f.timeoriginalestimate // 0),
        timespent: ($f.timespent // 0),
        created: $f.created,
        resolutiondate: $f.resolutiondate,
        
        # Была ли задача переоткрыта?
        # Проверяем историю изменений (changelog.histories).
        # Ищем переходы статуса, где toString равно "Reopened" или "In Progress" ПОСЛЕ того, как задача была "Done"/"Closed".
        # Упрощенная логика: если в истории статусов есть переход ИЗ категории Done (или статуса Done) в статус отличный от Done.
        # Или проще: ищем, был ли статус "Reopened" когда-либо.
        was_reopened: (
          if ($i.changelog.histories // []) 
          | map(.items[] | select(.field == "status" and (.toString | test("Reopen|Re-open"; "i")))) 
          | length > 0 
          then true 
          else false 
          end
        ),

        task_cycle_seconds:
          (if ($f.issuetype.name == "Task" or $f.issuetype.name == "Improvement") and $f.resolutiondate != null and $f.created != null
           then
             ( ( ($f.resolutiondate | sub("\\.[0-9]+";"") | sub("[+-][0-9]{4}$";"") | sub("Z$";"") + "Z") | fromdateiso8601 )
             - ( ($f.created | sub("\\.[0-9]+";"") | sub("[+-][0-9]{4}$";"") | sub("Z$";"") + "Z") | fromdateiso8601 )
             )
           else 0 end)
      }
  )
' "${ALL_ISSUES_FILE}" > issues_flat.json

# --- 4. Агрегация по проектам и вывод CSV ---

echo "Aggregating metrics by project..." >&2

# Заголовок CSV
echo "project_key,avg_task_cycle_days,productivity,debug_percent,comms_percent,cr_count"

# Агрегация
jq -r '
  group_by(.project_key)[]
  | .[0].project_key as $project
  | (
      map(select(.issuetype == "Task" and .task_cycle_seconds > 0)) as $tasks
    | ($tasks | length) as $task_count
    | ($tasks | map(.task_cycle_seconds) | add // 0) as $task_cycle_sum
    | ($task_count | if . == 0 then 0 else ($task_cycle_sum / . / 86400.0) end) as $avg_task_cycle_days

    | (map(.timeoriginalestimate) | add // 0) as $est_sum
    | (map(.timespent) | add // 0) as $spent_sum
    | ($spent_sum | if . == 0 then 0 else ($est_sum / .) end) as $productivity

    | (map(select(.issuetype == "Bug" or .issuetype == "Incident") | .timespent) | add // 0) as $bug_spent
    | (map(select(.issuetype == "Task" or .issuetype == "Improvement") | .timespent) | add // 0) as $task_spent
    | ($task_spent | if . == 0 then 0 else ($bug_spent / .) end) as $debug_percent

    | (map(select(.issuetype == "Service task") | .timespent) | add // 0) as $service_spent
    | ($spent_sum | if . == 0 then 0 else ($service_spent / .) end) as $comms_percent
    
    | (map(select(.issuetype == "Test Execution" or .issuetype == "Sub Test Execution") | .timespent) | add // 0) as $test_spent
    
    # Можно добавить метрику % тестирования, если нужно:
    # | ($spent_sum | if . == 0 then 0 else ($test_spent / .) end) as $test_percent

    | (map(select(
        .issuetype == "Task" and (
          (.labels | index("CR")) != null or 
          (.labels | index("change-request")) != null or
          (.summary | test("CR"; "i"))
        )
      )) | length) as $cr_count

    | [
        $project,
        $avg_task_cycle_days,
        $productivity,
        $debug_percent,
        $comms_percent,
        $cr_count
      ]
      | @csv
  )
' issues_flat.json

echo "Done." >&2
