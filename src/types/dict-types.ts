export interface Dict {
  app: {
    buckets: string;
    doctor: string;
    packages: string;
    search: string;
    settings: string;
    title: string;
  };
  appUpdate: {
    available: string;
    installNow: string;
    installing: string;
    later: string;
  };
  bucket: {
    card: {
      packages: string;
      update: string;
      updated: string;
      updating: string;
      view: string;
    };
    grid: {
      cancel: string;
      cancelling: string;
      loading: string;
      noBucketsDescription: string;
      noBucketsFound: string;
      refresh: string;
      reloadLocal: string;
      title: string;
      updateAllGit: string;
    };
    page: {
      description: string;
    };
    search: {
      cancel: string;
      clearSearch: string;
      closeSearch: string;
      communityBuckets: string;
      description: string;
      disableChineseBuckets: string;
      disableCommunity: string;
      disableCommunityTitle: string;
      discoverDescription: string;
      discoverNew: string;
      enableExpandedSearch: string;
      estimatedDownloadSize: string;
      expandNote: string;
      expandSearchTitle: string;
      filterOptions: string;
      largeDatasetWarning: string;
      minimumGithubStars: string;
      note: string;
      resultsCount: string;
      searchBuckets: string;
      searchForBuckets: string;
      sortApps: string;
      sortBy: string;
      sortName: string;
      sortRelevance: string;
      sortStars: string;
      totalBuckets: string;
    };
    searchResults: {
      details: string;
      expandedSearch: string;
      install: string;
      installTitle: string;
      installing: string;
      noBucketsFound: string;
      noDescription: string;
      openInGithub: string;
      remove: string;
      removing: string;
      removingTitle: string;
      searchingBuckets: string;
      title: string;
      tryAdjustTerms: string;
      updated: string;
      verified: string;
      viewDetails: string;
    };
  };
  bucketInfo: {
    availablePackages: string;
    branch: string;
    bucket: string;
    clickToViewInfo: string;
    close: string;
    description: string;
    details: string;
    external: string;
    git: string;
    gitRepository: string;
    install: string;
    installing: string;
    lastUpdated: string;
    loadingPackages: string;
    localDirectory: string;
    name: string;
    noPackagesFound: string;
    openInExplorer: string;
    packages: string;
    packagesCount: string;
    path: string;
    refreshBucket: string;
    remove: string;
    removing: string;
    repository: string;
    type: string;
    unknown: string;
    viewOnGithub: string;
  };
  buttons: {
    cancel: string;
    close: string;
    closeDialog: string;
    collapse: string;
    confirm: string;
    goToBuckets: string;
    hide: string;
    install: string;
    removeAll: string;
    removeSelected: string;
    showLess: string;
    showMore: string;
    uninstall: string;
    updateAll: string;
  };
  doctor: {
    addShimModal: {
      addShim: string;
      arguments: string;
      argumentsHelp: string;
      argumentsPlaceholder: string;
      commandPath: string;
      globalShim: string;
      shimName: string;
      title: string;
    };
    cacheManager: {
      actionCannotBeUndone: string;
      cacheIsEmpty: string;
      confirmDeletion: string;
      delete: string;
      deleteAll: string;
      deleteFiles: string;
      filterPlaceholder: string;
      name: string;
      noCachedFiles: string;
      openCacheDirectory: string;
      size: string;
      title: string;
      version: string;
    };
    checkup: {
      description: string;
      install: string;
      installing: string;
      suggestion: string;
      title: string;
    };
    cleanup: {
      cleanupOldVersions: string;
      cleanupOutdatedCache: string;
      description: string;
      title: string;
    };
    commandInput: {
      clearOutput: string;
      description: string;
      enterCommand: string;
      enterFullCommand: string;
      executingCommand: string;
      information: string;
      maintenance: string;
      packageManagement: string;
      run: string;
      running: string;
      scoopPrefixDisabled: string;
      scoopPrefixEnabled: string;
      search: string;
      switchInputMode: string;
      title: string;
      waitingForCommands: string;
    };
    proxySettings: {
      clear: string;
      clearSuccess: string;
      description: string;
      loadError: string;
      loading: string;
      proxyAddress: string;
      proxyPlaceholder: string;
      save: string;
      saveError: string;
      saveSuccess: string;
      title: string;
    };
    scoopInfo: {
      cancel: string;
      editConfiguration: string;
      editScoopConfiguration: string;
      noConfigurationFound: string;
      openScoopDirectory: string;
      save: string;
      saving: string;
      title: string;
    };
    shimDetails: {
      arguments: string;
      hide: string;
      path: string;
      remove: string;
      source: string;
      unhide: string;
    };
    shimManager: {
      addShim: string;
      args: string;
      attributes: string;
      filterPlaceholder: string;
      hidden: string;
      name: string;
      noShimsFound: string;
      openShimDirectory: string;
      sourcePackage: string;
      title: string;
    };
    title: string;
  };
  installed: {
    grid: {
      bucket: string;
      updatedOn: string;
      version: string;
    };
    header: {
      checkStatus: string;
      filter: string;
      refresh: string;
      search: string;
      searchPlaceholder: string;
      switchToGridView: string;
      switchToListView: string;
      title: string;
      updateAll: string;
    };
    list: {
      bucket: string;
      cannotUnhold: string;
      changeBucket: string;
      ciVersionNote: string;
      heldTooltip: string;
      holdPackage: string;
      name: string;
      switchVersion: string;
      unholdPackage: string;
      uninstall: string;
      updateAvailableTooltip: string;
      updated: string;
      version: string;
      versionedTooltip: string;
    };
  };
  language: {
    description: string;
    title: string;
  };
  messages: {
    initTimeout: string;
    initTimeoutReason: string;
    initTimeoutShow: string;
    loading: string;
  };
  msiNotice: {
    closeApp: string;
    description: string;
    detailsDescription: string;
    detailsPoint1: string;
    detailsPoint2: string;
    detailsPoint3: string;
    detailsPoint4: string;
    detailsSolution: string;
    instruction: string;
    moreDetails: string;
    proceedAnyway: string;
    title: string;
    workaround: string;
  };
  noPackagesFound: {
    browsePackages: string;
    clearFilters: string;
    noInstalledYet: string;
    noMatchCriteria: string;
    title: string;
  };
  packageInfo: {
    availableVersions: string;
    backToBucket: string;
    bucket: string;
    changeBucket: string;
    changeBucketFor: string;
    close: string;
    current: string;
    debugFailed: string;
    debugStructure: string;
    description: string;
    details: string;
    ensureSoftwarePresent: string;
    errorLoadingManifest: string;
    errorLoadingVersions: string;
    errorSwitchingVersion: string;
    failedToOpenPath: string;
    forceUpdate: string;
    homepage: string;
    includes: string;
    installDate: string;
    installed: string;
    installedVersion: string;
    latestVersion: string;
    license: string;
    name: string;
    notes: string;
    openInExplorer: string;
    sure: string;
    switch: string;
    switchVersion: string;
    title: string;
    update: string;
    updateDate: string;
    version: string;
    versionManager: string;
    viewManifest: string;
    warning: string;
  };
  scan: {
  };
  scoopStatus: {
    allGoodMessage: string;
    appsWithIssues: string;
    badges: {
      heldPackage: string;
      updateAvailable: string;
    };
    bucketsOutOfDate: string;
    errorCheckingStatus: string;
    networkFailure: string;
    scoopOutOfDate: string;
    table: {
      installed: string;
      latest: string;
      name: string;
      status: string;
    };
    title: string;
  };
  search: {
    bar: {
      clearSearch: string;
      exactMatchTooltip: string;
      placeholder: string;
    };
    filter: {
      allBuckets: string;
    };
    refreshResults: string;
    results: {
      fromBucket: string;
      noPackagesFound: string;
      pageInfo: string;
    };
    tabs: {
      includes: string;
      packages: string;
    };
  };
  settings: {
    about: {
      checkNow: string;
      checkingForUpdates: string;
      customizedVersion: string;
      description: string;
      docs: string;
      downloadingNoSize: string;
      downloadingUpdate: string;
      installingUpdate: string;
      latestVersion: string;
      managedByScoop: string;
      myFork: string;
      noReleaseNotes: string;
      noUpdatesAvailable: string;
      pleaseReportIssues: string;
      releaseNotes: string;
      restartNow: string;
      retry: string;
      scoopUpdateInstruction: string;
      updateAvailable: string;
      updateAvailableDialog: string;
      updateComplete: string;
      updateFailed: string;
      updateReady: string;
      updateStatus: string;
      updateViaScoop: string;
      updatesViaScoop: string;
      upstream: string;
    };
    appData: {
      clearCache: string;
      clearCacheButton: string;
      clearCacheDescription: string;
      clearCacheError: string;
      clearError: string;
      clearingCache: string;
      dataDirectory: string;
      description: string;
      factoryReset: string;
      factoryResetButton: string;
      factoryResetDescription: string;
      loadError: string;
      logDirectory: string;
      openDirectory: string;
      resetting: string;
      sure: string;
      title: string;
    };
    autoCleanup: {
      cleanOldVersions: string;
      cleanOldVersionsDescription: string;
      cleanOutdatedCache: string;
      cleanOutdatedCacheDescription: string;
      description: string;
      title: string;
      versionsToKeep: string;
    };
    bucketAutoUpdate: {
      active: string;
      autoUpdatePackages: string;
      autoUpdatePackagesDescription: string;
      customInterval: string;
      customIntervalDescription: string;
      dayDisplay: string;
      dayFormat: string;
      days: string;
      daysFormat: string;
      debug: string;
      debugDescription: string;
      description: string;
      error: string;
      every24Hours: string;
      every24HoursDescription: string;
      every24HoursDisplay: string;
      everyWeek: string;
      everyWeekDescription: string;
      everyWeekDisplay: string;
      hourDisplay: string;
      hourFormat: string;
      hours: string;
      hoursFormat: string;
      intervalTooShort: string;
      minimumInterval: string;
      minuteDisplay: string;
      minuteFormat: string;
      minutes: string;
      minutesFormat: string;
      off: string;
      offDescription: string;
      oneHourDisplay: string;
      previewFormat: string;
      quantity: string;
      save: string;
      saved: string;
      saving: string;
      secondsFormat: string;
      silentUpdate: string;
      silentUpdateDescription: string;
      sixHoursDisplay: string;
      title: string;
      unit: string;
      weekDisplay: string;
      weekFormat: string;
      weeks: string;
      weeksFormat: string;
    };
    category: {
      about: string;
      automation: string;
      management: string;
      security: string;
      windowUi: string;
    };
    debug: {
      description: string;
      title: string;
    };
    defaultLaunchPage: {
      buckets: string;
      description: string;
      doctor: string;
      installed: string;
      search: string;
      settings: string;
      title: string;
    };
    heldPackages: {
      description: string;
      noPackagesHeld: string;
      title: string;
      unhold: string;
    };
    scoopConfiguration: {
      auto: string;
      autoDetectDescription: string;
      description: string;
      detectError: string;
      detectSuccess: string;
      invalidDirectory: string;
      loadError: string;
      pathLabel: string;
      pathPlaceholder: string;
      save: string;
      saveError: string;
      saveSuccess: string;
      test: string;
      title: string;
      validDirectory: string;
      validationError: string;
      validationFailed: string;
    };
    startup: {
      description: string;
      silentStartup: {
        description: string;
        title: string;
      };
      title: string;
    };
    theme: {
      darkMode: string;
      description: string;
      lightMode: string;
      title: string;
    };
    title: string;
    tray: {
      closeAndDisable: string;
      hide: string;
      keepInTray: string;
      notificationMessage: string;
      notificationTitle: string;
      quit: string;
      refreshApps: string;
      scoopApps: string;
      show: string;
    };
    trayApps: {
      availableApps: string;
      configure: string;
      description: string;
      enableTrayApps: string;
      enableTrayAppsDescription: string;
      helpText: string;
      manageContextMenu: string;
      manageTrayAppsDescription: string;
      noAppsFound: string;
      noAvailableApps: string;
      noSelectedApps: string;
      selectedApps: string;
      selectedCount: string;
      title: string;
    };
    ui: {
      UDABottonDescription: string;
      UDABottonTitle: string;
    };
    virustotal: {
      apiKey: string;
      apiKeyPlaceholder: string;
      autoScanPackages: string;
      description: string;
      invalidApiKey: string;
      loadError: string;
      loading: string;
      save: string;
      saveError: string;
      saveSuccess: string;
      title: string;
    };
    windowBehavior: {
      description: string;
      title: string;
    };
  };
  status: {
    error: string;
    inProgress: string;
    loading: string;
  };
  tray: {
  };
  trayNotification: {
  };
  update: {
    allTooltip: string;
    loading: string;
    success: string;
  };
  updateChannel: {
  };
  warnings: {
    multiInstance: {
      dontShowAgain: string;
      message: string;
      title: string;
    };
  };

  [key: string]: string | ((...args: any[]) => string) | any;
}