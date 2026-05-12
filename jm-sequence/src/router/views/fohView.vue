<template>
    <div class="foh-container">
        <header class="foh-container">
            <div class="header-title">
                <div class="header-logo">
                    <img class="logo-image" src="@/assets/img/DarioContreras-logo-sm.png"
                        alt="Dario Contreras Logo">
                </div>
                <div class="header-text">
                    <h1 class="hospital-name">Hospital Docente Universitario Dr. Darío Contreras</h1>
                    <p class="system-name">JM Sequence - Turns Sequence</p>
                </div>
            </div>
            <div class="header-time time">{{ currentTime || '10:00:08 a.m.'}}</div>
        </header>

        <div class="foh-content">
            <div class="left-column">
                <!-- Video -->
                <section class="video">
                    <div></div>
                </section>
                <section class="overview">
                    <div class="overview-title">Counters</div>
                    <div class="counter-cards"> //stations-row
                        <div  class="counter-card">
                            <div v-for="counter in counters" :key="counter.id" class="counter-container" :class="{ active: counter.active }">
                                <div class="counter-id">{{ counter.id || 'Counter 1' }}</div>
                                <div class="counter-turn">{{ counter.currentTurn || 'W888' }}</div>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
            <div class="right-column"> 
                <div class="active-call">
                    <div class="active-title">Turn call</div>
                    <div v-if="store.activeTurn" class="active-display"> <!-- active turn -->
                        <div class="active-turn"> <!-- turn info -->
                            <div class="active-turn_title">Turn</div> <!-- turn-label -->
                            <div class="active-turn_id"> {{ store.activeTurn.code || 'W888'}}</div>  
                        </div>
                        <div class="arrow"></div>
                        <div class="active-counter">
                            <div class="active-counter_title">Counter</div> <!-- station-label -->
                            <div class="active-counter_content">
                                <div class="active-counter_id"> {{ store.activeTurn.counterId || '88' }}</div>
                                <div class="active-service"> {{ store.activeTurn.service || 'Laboratory' }}</div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="recent-turns">
                    <div class="recent-title">Last turns</div>
                    <div class="recent-cards"> <!-- turn-list-->
                        <div v-for="(turn, index) in displayHistory" :key="turn.id" class="recent-card" :class="getHistoryItemClass(index)">
                            <div class="recent-call">
                                <div class="recent-call_status"></div>
                                <div class="recent-call_id"> {{ turn.code || 'W888' }}</div>
                            </div>
                            <div class="recent-counter">
                                <div class="recent-counter_service"> {{ turn.service || 'Laboratory' }}</div>
                                <div class="recent-divider">—</div>
                                <div class="recent-counter_id"> {{ turn.counterId || '88' }}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    <!-- Footer ticker -->
    <footer class="foh-footer">
        <div class="ticker-content">
            <span class="ticker-item">
                Welcome to Hospital Docente Universitario Dr. Darío Contreras. Please take a ticket and wait for your turn.
            </span>
        </div>
    </footer>
</template>

<style scoped>
    @import url('https://fonts.googleapis.com/css2?family=Figtree:ital,wght@0,300..900;1,300..900&family=Syne:wght@400..800&display=swap');

    html {
        background-color: yellow;
    }

    body {
        width: 1920px;
        height: 1080px;
        border: solid 1px green;
        background-color: #07101E;
    }

    header {
        display: flex;
        box-sizing: border-box;
        width: 100%;
        flex-direction: row;
        padding: 24px;
        gap: 960px;
        border-bottom: 2px solid white;
    }

    .header-title {
        display: flex;
        flex-direction: row;
        gap: 32px;
        width: 716px;
        color: #EEF3FF;
    }

    h1 {
        margin: 0;
        font-family: "Syne";
        font-weight: bold;
        font-size: 32px;
        line-height: 36px;
        color: #EEF3FF;
    }

    p {
        font-family: "Syne";
        margin: 0;
        font-size: 24px;
        color: #EEF3FF;
    }

    .system-name {
        color: #EEF3FF;
        opacity: 60%;
    }

    .header-time {
        font-family: "Figtree";
        font-weight: 800;
        font-size: 32px;
        color: #EEF3FF;
        opacity: 60%;
    }

    .logo-image {
        width: 96px;
        height: 96px;
        background-color: blue;
    }

    .foh-content {
        padding: 0;
        display: flex;
        flex-direction: row;
    }

    .video {
        width: 1120px;
        height: 630px;
        background-color: red;
        padding: 0 24px;
        border: 2px solid white;
        border-top: 0;
        border-left: 0;
    }

    .overview {
        padding: 24px;
        border-right: 2px solid white;
    }

    .overview-title {
        font-family: "Figtree";
        font-size: 32px;
        font-weight: bold;
        color: #0f9e69;
        margin-bottom: 8px;
    }

    .counter-cards {
        display: flex;
        flex-direction: row;
        gap: 28px;
    }

    .counter-card {
        width: 210px;
        height: 114px;
        background-color: #112035;
        padding: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 16px;
    }

    .counter-id {
        font-family: "Figtree";
        font-weight: 400;
        font-size: 32px;
        color: #EEF3FF;
        opacity: 60%;
    }

    .counter-turn {
        font-family: "Syne";
        font-weight: 700;
        font-size: 64px;
        color: #EEF3FF;
    }

    .active-display {
        display: flex;
        flex-direction: row;
        align-items: flex-start;
        gap: 21px;
    }

    .active-turn {
        display: flex;
        flex-direction: column;
    }

    .active-call {
        display: flex;
        flex-direction: column;
        gap: 40px;
        padding: 31px;
        border-bottom: 2px solid white;
        background-color: #112035;
    }

    .active-counter {
        display: flex;
        flex-direction: column;
    }

    .active-counter_content {
        display: flex;
        gap: 16px;
        flex-direction: column;
    }

    .active-title {
        font: 700 48px "Figtree";
        color: #0f9e69;
    }

    .active-turn_title,
    .active-counter_title {
        font: 500 32px "Figtree";
        color: #EEF3FF;
        opacity: 60%;
    }

    .active-turn_id,
    .active-counter_id {
        font: 700 128px "Syne";
        margin-top: -16px;
        color: #EEF3FF;
    }

    .active-service {
        font: 700 32px "Figtree";
        margin-top: -40px;
        color: #EEF3FF;
        opacity: 60%;
    }

    .arrow {
        width: 48px;
        height: 48px;
        background-color: blue;
        margin: 72px 0;
        color: #EEF3FF;
    }

    .recent-turns {
        display: flex;
        flex-direction: column;
        padding: 24px;
    }

    .recent-title {
        font-family: "Figtree";
        font-size: 32px;
        font-weight: bold;
        color: #0f9e69;
        margin-bottom: 8px;
    }

    .recent-cards {
        display: flex;
        flex-direction: column;
        gap: 24px;
    }

    .recent-card {
        display: flex;
        flex-direction: row;
        gap: 128px;
        background-color: #112035;
        padding: 24px;
        border-radius: 12px;
    }

    .recent-call {
        display: inline-flex;
        gap: 32px;
        align-items: center;
    }

    .recent-call_status {
        width: 32px;
        height: 32px;
        background-color: green;
    }

    .recent-call_id {
        font-family: "Figtree";
        font-size: 32px;
        font-weight: 500;
        color: #EEF3FF;
    }

    .recent-counter {
        display: inline-flex;
        gap: 24px;
        font-family: "Figtree";
        font-size: 32px;
        color: #EEF3FF;
        font-weight: regular;
        opacity: 60%;
    }

    .foh-footer {
        height: 40px;
        background: var(--foh-blue-600, #1057CC);
        border-top: #EEF3FF;
        overflow: hidden;
        display: flex;
        align-items: center;
    }

    .ticker-content {
        animation: ticker-scroll 30s linear infinite;
        white-space: nowrap;
        padding: 0 48px;
    }

    .ticker-item {
        font-size: 24px;
        color: #EEF3FF;
        font-weight: 400;
    }
</style>