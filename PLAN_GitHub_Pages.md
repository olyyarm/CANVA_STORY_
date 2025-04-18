# План развертывания проекта на GitHub Pages с использованием GitHub Actions

## Цели:
1.  Настроить игнорирование папки `MAT/` в Git.
2.  Настроить проект для корректной работы на GitHub Pages.
3.  Автоматизировать процесс сборки и развертывания с помощью GitHub Actions.

## Шаги:

1.  **Обновить `.gitignore`**:
    *   Добавить строку `MAT/` в конец файла `.gitignore`.

2.  **Обновить `package.json`**:
    *   Добавить поле `"homepage": "https://olyyarm.github.io/CANVA_STORY_/"` на верхний уровень JSON-объекта (например, после поля `"version"`).

3.  **Создать Workflow для GitHub Actions**:
    *   Создать директорию `.github/workflows/` в корне проекта.
    *   Внутри этой директории создать файл `deploy.yml`.
    *   Наполнить `deploy.yml` следующим содержимым:
        ```yaml
        name: Deploy to GitHub Pages

        on:
          push:
            branches:
              - main # Запускать при пуше в ветку main
          workflow_dispatch: # Позволяет запускать вручную из интерфейса GitHub

        permissions:
          contents: read
          pages: write
          id-token: write

        jobs:
          build:
            runs-on: ubuntu-latest
            steps:
              - name: Checkout repository
                uses: actions/checkout@v4

              - name: Set up Node.js
                uses: actions/setup-node@v4
                with:
                  node-version: '20' # Укажите вашу версию Node.js, если она другая
                  cache: 'npm' # Или 'yarn', если используете Yarn

              - name: Install dependencies
                run: npm install # Или yarn install

              - name: Build project
                run: npm run build # Или yarn build
                env:
                  # Если Vite нужно знать базовый путь во время сборки
                  # Убедитесь, что имя репозитория указано верно
                  BASE_URL: /CANVA_STORY_/ 

              - name: Setup Pages
                uses: actions/configure-pages@v4

              - name: Upload artifact
                uses: actions/upload-pages-artifact@v3
                with:
                  # Убедитесь, что папка сборки Vite указана верно ('dist' по умолчанию)
                  path: './dist' 

          deploy:
            needs: build
            permissions:
              pages: write
              id-token: write
            environment:
              name: github-pages
              url: ${{ steps.deployment.outputs.page_url }}
            runs-on: ubuntu-latest
            steps:
              - name: Deploy to GitHub Pages
                id: deployment
                uses: actions/deploy-pages@v4
        ```

4.  **Настроить GitHub Pages в репозитории**:
    *   После первого успешного запуска Workflow (после коммита и пуша изменений) перейти в настройки репозитория GitHub (`Settings` -> `Pages`).
    *   В разделе `Build and deployment` выбрать источником `GitHub Actions`. GitHub должен автоматически обнаружить артефакт сборки и развернуть его.

## Визуализация процесса:

```mermaid
graph TD
    A[Локальная разработка в ветке main] --> B(Изменить .gitignore);
    B --> C[Добавить homepage в package.json];
    C --> D[Создать .github/workflows/deploy.yml];
    D --> E[Закоммитить и запушить изменения в main];
    E -- GitHub Actions Trigger --> F{Запуск Workflow};
    F --> G[Checkout кода];
    G --> H[Установка Node.js и зависимостей];
    H --> I[Сборка проекта (npm run build) -> папка dist];
    I --> J[Загрузка артефакта сборки];
    J --> K[Развертывание артефакта на GitHub Pages];
    K --> L[Настроить GitHub Pages в репозитории для GitHub Actions];
    L --> M[Сайт доступен по адресу homepage];